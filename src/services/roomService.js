const { supabase } = require('../db/supabase');
const { generateRoomCode } = require('../utils/codeGenerator');
const { grantFreeCards } = require('./masterDeckService');
const { createNotification } = require('./notificationService');

// Only two plan types are supported: 7_DAYS (free) and 30_DAYS (paid).
// 1_YEAR was removed per client decision.
const VALID_EXPIRY_TYPES = ['7_DAYS', '30_DAYS'];

const calculateExpiry = (expiryType) => {
    const date = new Date();
    if (expiryType === '30_DAYS') date.setDate(date.getDate() + 30);
    else date.setDate(date.getDate() + 7); // Default: 7_DAYS
    return date.toISOString();
};

const populateRoomNames = async (room) => {
    if (!room) return null;
    const hostId = room.host_id;
    const partnerId = room.partner_id;

    const idsToFetch = [hostId];
    if (partnerId) idsToFetch.push(partnerId);

    try {
        const { data: profiles, error: profileError } = await supabase
            .from('profiles')
            .select('id, first_name, avatar_url')
            .in('id', idsToFetch);

        if (!profileError && profiles) {
            const hostProfile = profiles.find(p => p.id === hostId);
            const partnerProfile = partnerId ? profiles.find(p => p.id === partnerId) : null;
            
            room.host_name = hostProfile ? hostProfile.first_name : 'Host';
            room.partner_name = partnerProfile ? partnerProfile.first_name : null;
            room.host_avatar = hostProfile ? hostProfile.avatar_url : null;
            room.partner_avatar = partnerProfile ? partnerProfile.avatar_url : null;
        } else {
            room.host_name = 'Host';
            room.partner_name = partnerId ? 'Partner' : null;
            room.host_avatar = null;
            room.partner_avatar = null;
        }
    } catch (e) {
        room.host_name = 'Host';
        room.partner_name = partnerId ? 'Partner' : null;
        room.host_avatar = null;
        room.partner_avatar = null;
    }
    return room;
};

const createRoom = async (hostId, expiryType = '7_DAYS') => {
    // Validate plan type — only 7_DAYS and 30_DAYS are supported
    if (!VALID_EXPIRY_TYPES.includes(expiryType)) {
        const err = new Error(`Invalid room plan. Choose '7_DAYS' or '30_DAYS'.`);
        err.status = 400;
        throw err;
    }

    // Archive existing rooms for this host
    await supabase
        .from('rooms')
        .update({ status: 'COMPLETED' })
        .eq('host_id', hostId)
        .in('status', ['WAITING', 'ACTIVE']);

    const code = generateRoomCode();
    const expiresAt = calculateExpiry(expiryType);

    const { data, error } = await supabase
        .from('rooms')
        .insert([{
            code,
            host_id: hostId,
            expiry_type: expiryType,
            expires_at: expiresAt,
            status: 'WAITING'
        }])
        .select()
        .single();

    if (error) {
        const err = new Error(error.message);
        err.status = 400;
        throw err;
    }
    return await populateRoomNames(data);
};

const joinRoom = async (partnerId, code) => {
    const rawCode = (code || '').toUpperCase().trim();
    if (!rawCode) {
        const err = new Error('Room code is required.');
        err.status = 400;
        throw err;
    }

    // Build all possible code variants for robust lookup
    const codeVariants = new Set();
    codeVariants.add(rawCode);

    const alphanumeric = rawCode.replace(/[^A-Z0-9]/g, '');
    if (alphanumeric) {
        codeVariants.add(alphanumeric);
        if (alphanumeric.length === 6) {
            codeVariants.add(`SSF-${alphanumeric}`);
            codeVariants.add(`ELV-${alphanumeric}`);
        }
        if (alphanumeric.startsWith('SSF') && alphanumeric.length >= 4) {
            const suffix = alphanumeric.slice(3);
            codeVariants.add(`SSF-${suffix}`);
            codeVariants.add(`ELV-${suffix}`);
            codeVariants.add(suffix);
        }
        if (alphanumeric.startsWith('ELV') && alphanumeric.length >= 4) {
            const suffix = alphanumeric.slice(3);
            codeVariants.add(`SSF-${suffix}`);
            codeVariants.add(`ELV-${suffix}`);
            codeVariants.add(suffix);
        }
    }

    if (rawCode.startsWith('SSF-')) {
        codeVariants.add(rawCode.replace(/^SSF-/, 'ELV-'));
        codeVariants.add(rawCode.replace(/^SSF-/, ''));
    } else if (rawCode.startsWith('ELV-')) {
        codeVariants.add(rawCode.replace(/^ELV-/, 'SSF-'));
        codeVariants.add(rawCode.replace(/^ELV-/, ''));
    }

    const variantsArray = Array.from(codeVariants);
    console.log('[joinRoom] Searching for code variants:', variantsArray);

    // 1. Find active/waiting room with any of these code variants
    const { data: rooms, error: findError } = await supabase
        .from('rooms')
        .select('*')
        .in('code', variantsArray)
        .in('status', ['WAITING', 'ACTIVE'])
        .order('created_at', { ascending: false })
        .limit(1);

    const room = (rooms && rooms.length > 0) ? rooms[0] : null;

    if (findError) {
        console.error('[joinRoom] DB error finding room:', findError.message);
        const err = new Error('Server error looking up room.');
        err.status = 500;
        throw err;
    }

    if (!room) {
        // Check if the room exists but is COMPLETED or EXPIRED
        const { data: pastRooms } = await supabase
            .from('rooms')
            .select('status')
            .in('code', variantsArray)
            .order('created_at', { ascending: false })
            .limit(1);

        const pastRoom = pastRooms && pastRooms[0];
        if (pastRoom?.status === 'COMPLETED' || pastRoom?.status === 'EXPIRED') {
            const err = new Error('This room has ended or expired.');
            err.status = 400;
            throw err;
        }

        const err = new Error('Invalid room code.');
        err.status = 404;
        throw err;
    }

    // 2. Check if host is joining their own room (just return it)
    if (room.host_id === partnerId) {
        return await populateRoomNames(room);
    }

    // 3. Check if partner is already in this active room (just return it)
    if (room.partner_id === partnerId && room.status === 'ACTIVE') {
        return await populateRoomNames(room);
    }

    // 4. Check if room is completed or expired
    if (room.status === 'COMPLETED' || room.status === 'EXPIRED') {
        const err = new Error('This room has ended or expired.');
        err.status = 400;
        throw err;
    }

    // 5. Check if room is full
    if (room.partner_id && room.partner_id !== partnerId) {
        const err = new Error('Room is already full.');
        err.status = 400;
        throw err;
    }

    // 6. Check expiry safely
    if (room.expires_at) {
        const expiryTime = new Date(room.expires_at).getTime();
        if (!isNaN(expiryTime) && expiryTime < Date.now()) {
            await supabase.from('rooms').update({ status: 'EXPIRED' }).eq('id', room.id);
            const err = new Error('Room has expired.');
            err.status = 400;
            throw err;
        }
    }

    // 7. Archive any old WAITING rooms for the partner joining
    await supabase
        .from('rooms')
        .update({ status: 'COMPLETED' })
        .eq('host_id', partnerId)
        .in('status', ['WAITING'])
        .neq('id', room.id);

    // 8. Update room to ACTIVE
    const { data: updatedRoom, error: updateError } = await supabase
        .from('rooms')
        .update({ partner_id: partnerId, status: 'ACTIVE' })
        .eq('id', room.id)
        .select()
        .single();

    if (updateError) {
        const err = new Error(updateError.message);
        err.status = 400;
        throw err;
    }

    // 9. Automatically grant free cards for BOTH users based on plan type:
    //    7_DAYS  → 7 regular cards from 7-day master deck (no deflect)
    //    30_DAYS → 30 regular cards from 30-day master deck + 5 deflect cards
    await Promise.allSettled([
        grantFreeCards(room.host_id, updatedRoom.id, room.expiry_type),
        grantFreeCards(partnerId,    updatedRoom.id, room.expiry_type),
    ]);

    // ── Notify host: partner has joined, game is now ACTIVE ────────
    await createNotification(
        room.host_id,
        'PARTNER_JOINED',
        '💕 Partner Joined!',
        'Your partner joined the room. Your game is now ACTIVE! Cards have been added to your deck.',
        { room_id: updatedRoom.id, room_code: updatedRoom.code }
    );

    // ── Notify both users: free cards were granted ───────────────
    const planLabel = room.expiry_type === '30_DAYS' ? '30' : '7';
    await Promise.allSettled([
        createNotification(
            room.host_id,
            'FREE_CARDS_GRANTED',
            '🎁 Free Cards Added!',
            `${planLabel} free cards have been added to your deck. Start playing!`,
            { room_id: updatedRoom.id }
        ),
        createNotification(
            partnerId,
            'FREE_CARDS_GRANTED',
            '🎁 Free Cards Added!',
            `${planLabel} free cards have been added to your deck. Start playing!`,
            { room_id: updatedRoom.id }
        ),
    ]);

    const populated = await populateRoomNames(updatedRoom);

    // ── Emit real-time Socket.io events so host screen updates instantly! ──
    try {
        const { getIo, emitToUser } = require('./socketService');
        const ioInstance = getIo();
        
        const partnerJoinedPayload = {
            room: populated,
            partnerId,
            partnerName: populated.partner_name,
            partnerAvatar: populated.partner_avatar,
            status: 'ACTIVE'
        };

        // Broadcast to room code channel and room UUID channel
        ioInstance.to(room.code).emit('partner_joined', partnerJoinedPayload);
        ioInstance.to(room.id).emit('partner_joined', partnerJoinedPayload);
        
        // Push directly to host's personal user socket channel
        emitToUser(room.host_id, 'partner_joined', partnerJoinedPayload);
        emitToUser(room.host_id, 'room_updated', partnerJoinedPayload);
    } catch (socketErr) {
        console.log('[joinRoom] Socket broadcast warning:', socketErr.message);
    }

    return populated;
};

const getActiveRoom = async (userId) => {
    // 1. Prioritize ACTIVE room where user is host or partner
    const { data: activeRooms, error: activeErr } = await supabase
        .from('rooms')
        .select('*')
        .or(`host_id.eq.${userId},partner_id.eq.${userId}`)
        .eq('status', 'ACTIVE')
        .order('created_at', { ascending: false })
        .limit(1);

    if (activeErr) {
        console.error('[getActiveRoom] DB error querying active rooms:', activeErr.message);
        const err = new Error(activeErr.message);
        err.status = 500;
        throw err;
    }

    let room = activeRooms && activeRooms.length > 0 ? activeRooms[0] : null;

    // 2. If no ACTIVE room, check for a WAITING room
    if (!room) {
        const { data: waitingRooms, error: waitingErr } = await supabase
            .from('rooms')
            .select('*')
            .or(`host_id.eq.${userId},partner_id.eq.${userId}`)
            .eq('status', 'WAITING')
            .order('created_at', { ascending: false })
            .limit(1);

        if (waitingErr) {
            console.error('[getActiveRoom] DB error querying waiting rooms:', waitingErr.message);
            const err = new Error(waitingErr.message);
            err.status = 500;
            throw err;
        }

        room = waitingRooms && waitingRooms.length > 0 ? waitingRooms[0] : null;
    }

    if (!room) {
        return null;
    }

    // 3. Safe expiry check (only auto-expire if expires_at is a valid timestamp in past)
    if (room.expires_at) {
        const expiryTime = new Date(room.expires_at).getTime();
        if (!isNaN(expiryTime) && expiryTime < Date.now()) {
            console.log(`[getActiveRoom] Room ${room.id} expired at ${room.expires_at}`);
            await supabase.from('rooms').update({ status: 'EXPIRED' }).eq('id', room.id);
            return null;
        }
    }

    return await populateRoomNames(room);
};

const leaveRoom = async (userId, roomId) => {
    // 1. Find room
    const { data: room, error: findError } = await supabase
        .from('rooms')
        .select('*')
        .eq('id', roomId)
        .single();

    if (findError || !room) {
        const err = new Error('Room not found.');
        err.status = 404;
        throw err;
    }

    if (room.host_id !== userId && room.partner_id !== userId) {
        const err = new Error('You are not a participant in this room.');
        err.status = 403;
        throw err;
    }

    if (room.status === 'COMPLETED' || room.status === 'EXPIRED') {
        const err = new Error(`Room is already ${room.status}.`);
        err.status = 400;
        throw err;
    }

    // Determine the other user to notify them
    const otherUserId = room.host_id === userId ? room.partner_id : room.host_id;

    // Mark room as COMPLETED
    const { error: updateError } = await supabase
        .from('rooms')
        .update({ status: 'COMPLETED', updated_at: new Date().toISOString() })
        .eq('id', roomId);

    if (updateError) {
        const err = new Error('Failed to leave room.');
        err.status = 500;
        throw err;
    }

    // Expire pending cards and unused deck cards
    await supabase
        .from('room_card_sends')
        .update({ status: 'PENALTY' })
        .eq('room_id', roomId)
        .in('status', ['SENT', 'WAITING', 'IN_PROGRESS', 'COMPLETED_BY_RECEIVER']);

    await supabase
        .from('user_card_deck')
        .update({ expired: true })
        .eq('room_id', roomId)
        .eq('is_used', false)
        .eq('expired', false);

    // Notify the other user if they exist
    if (otherUserId) {
        await createNotification(
            otherUserId,
            'ROOM_LEFT',
            'Partner Left',
            'Your partner has left the room. The game has ended.',
            { room_id: roomId }
        );
    }

    return { message: 'You have left the room.' };
};

// ─────────────────────────────────────────────────────────────
// Get Room History for a User (Account-wide or specific room)
// ─────────────────────────────────────────────────────────────
const getRoomHistory = async (userId, roomId) => {
    let roomMap = new Map();
    let roomIds = [];
    
    // 1. Fetch user's rooms (either specific roomId or all rooms user participated in)
    let roomQuery = supabase
        .from('rooms')
        .select(`
            id, code, status, created_at,
            host:users!rooms_host_id_fkey (id, name, avatar_url),
            partner:users!rooms_partner_id_fkey (id, name, avatar_url),
            game_state
        `);

    if (roomId) {
        roomQuery = roomQuery.eq('id', roomId);
    } else {
        roomQuery = roomQuery.or(`host_id.eq.${userId},partner_id.eq.${userId}`).order('created_at', { ascending: false });
    }

    const { data: rooms, error: roomErr } = await roomQuery;
    if (roomErr) {
        console.error('[getRoomHistory] Room query error:', roomErr);
        throw roomErr;
    }
    if (!rooms || rooms.length === 0) return [];

    rooms.forEach(r => {
        const isHost = r.host?.id === userId;
        const partner = isHost ? r.partner : r.host;
        roomMap.set(r.id, {
            id: r.id,
            code: r.code,
            status: r.status,
            created_at: r.created_at,
            partner_name: partner?.name || 'Partner',
            partner_avatar: partner?.avatar_url || null,
            game_state: r.game_state
        });
        roomIds.push(r.id);
    });

    // 2. Fetch card sends across these rooms
    const { data: sends, error: sendsErr } = await supabase
        .from('room_card_sends')
        .select(`
            id, room_id, sender_id, receiver_id, status, message, sent_at,
            accepted_at, completed_at, deflected_at,
            sender:users!room_card_sends_sender_id_fkey (id, name, avatar_url),
            receiver:users!room_card_sends_receiver_id_fkey (id, name, avatar_url),
            cards ( id, name, power_description, image_url, card_type, card_categories (name, theme_color) )
        `)
        .in('room_id', roomIds)
        .order('sent_at', { ascending: false })
        .limit(100);
        
    if (sendsErr) {
        console.error('[getRoomHistory] Card sends query error:', sendsErr);
    }

    let historyItems = [];

    if (Array.isArray(sends) && sends.length > 0) {
        historyItems = sends.map(send => {
            const roomInfo = roomMap.get(send.room_id) || {};
            const isSentByMe = send.sender_id === userId;
            const senderName = send.sender?.name || (isSentByMe ? 'You' : (roomInfo.partner_name || 'Partner'));
            const receiverName = send.receiver?.name || (!isSentByMe ? 'You' : (roomInfo.partner_name || 'Partner'));

            return {
                id: send.id,
                room_id: send.room_id,
                room_code: roomInfo.code || 'GAME',
                room_status: roomInfo.status || 'ACTIVE',
                partner_name: roomInfo.partner_name || (isSentByMe ? receiverName : senderName),
                partner_avatar: roomInfo.partner_avatar || (isSentByMe ? send.receiver?.avatar_url : send.sender?.avatar_url) || null,
                sender_id: send.sender_id,
                receiver_id: send.receiver_id,
                sender_name: senderName,
                receiver_name: receiverName,
                sender_avatar: send.sender?.avatar_url || null,
                receiver_avatar: send.receiver?.avatar_url || null,
                is_sent_by_me: isSentByMe,
                card_id: send.cards?.id,
                status: (send.status || 'SENT').toUpperCase(),
                sent_at: send.sent_at,
                accepted_at: send.accepted_at,
                completed_at: send.completed_at,
                deflected_at: send.deflected_at,
                time: send.sent_at ? new Date(send.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Recently',
                category: send.cards?.card_categories?.name || 'Dare',
                theme_color: send.cards?.card_categories?.theme_color || '#e11d48',
                card_type: send.cards?.card_type || 'STANDARD',
                title: send.cards?.name || 'Card Dare',
                description: send.cards?.power_description || '',
                message: send.message || '',
                image: send.cards?.image_url || null
            };
        });
    }

    // 3. Fallback to game_state challenge_history for rooms if room_card_sends was empty
    if (historyItems.length === 0) {
        rooms.forEach(r => {
            const roomInfo = roomMap.get(r.id) || {};
            const gsHistory = r.game_state?.challenge_history || [];
            gsHistory.forEach(item => {
                const isSentByMe = item.sender_id ? item.sender_id === userId : true;
                historyItems.push({
                    id: item.id || `hist_${Math.random()}`,
                    room_id: r.id,
                    room_code: roomInfo.code || 'GAME',
                    room_status: roomInfo.status || 'ACTIVE',
                    partner_name: roomInfo.partner_name || 'Partner',
                    partner_avatar: roomInfo.partner_avatar || null,
                    sender_id: item.sender_id || userId,
                    sender_name: isSentByMe ? 'You' : roomInfo.partner_name,
                    receiver_name: !isSentByMe ? 'You' : roomInfo.partner_name,
                    is_sent_by_me: isSentByMe,
                    status: (item.status || 'COMPLETED').toUpperCase(),
                    sent_at: item.sent_at || r.created_at,
                    time: item.time || (item.sent_at ? new Date(item.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Recently'),
                    category: item.category || 'Dare',
                    title: item.title || 'Dare Card',
                    description: item.description || '',
                    message: item.message || '',
                    image: item.image || null
                });
            });
        });
    }

    // Sort newest to oldest
    return historyItems.sort((a, b) => {
        const timeA = a.sent_at ? new Date(a.sent_at).getTime() : 0;
        const timeB = b.sent_at ? new Date(b.sent_at).getTime() : 0;
        return timeB - timeA;
    });
};

module.exports = {
    createRoom,
    joinRoom,
    getActiveRoom,
    leaveRoom,
    getRoomHistory
};
