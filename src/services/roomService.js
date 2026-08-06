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
            .select('id, first_name')
            .in('id', idsToFetch);

        if (!profileError && profiles) {
            const hostProfile = profiles.find(p => p.id === hostId);
            const partnerProfile = partnerId ? profiles.find(p => p.id === partnerId) : null;
            
            room.host_name = hostProfile ? hostProfile.first_name : 'Host';
            room.partner_name = partnerProfile ? partnerProfile.first_name : null;
        } else {
            room.host_name = 'Host';
            room.partner_name = partnerId ? 'Partner' : null;
        }
    } catch (e) {
        room.host_name = 'Host';
        room.partner_name = partnerId ? 'Partner' : null;
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

    // 6. Check expiry
    if (new Date(room.expires_at) < new Date()) {
        await supabase.from('rooms').update({ status: 'EXPIRED' }).eq('id', room.id);
        const err = new Error('Room has expired.');
        err.status = 400;
        throw err;
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

    return await populateRoomNames(updatedRoom);
};

const getActiveRoom = async (userId) => {
    const { data: rooms, error } = await supabase
        .from('rooms')
        .select('*')
        .or(`host_id.eq.${userId},partner_id.eq.${userId}`)
        .in('status', ['WAITING', 'ACTIVE'])
        .order('created_at', { ascending: false })
        .limit(1);

    if (error) {
        const err = new Error(error.message);
        err.status = 400;
        throw err;
    }

    if (!rooms || rooms.length === 0) {
        return null;
    }

    const room = rooms[0];
    if (new Date(room.expires_at) < new Date()) {
        // Auto-expire
        await supabase.from('rooms').update({ status: 'EXPIRED' }).eq('id', room.id);
        return null;
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
// Get Room History for a User
// ─────────────────────────────────────────────────────────────
const getRoomHistory = async (userId, roomId) => {
    let roomIds = [];
    
    if (roomId) {
        // If specific room is requested, just use that
        roomIds = [roomId];
    } else {
        // 1. Get all room IDs for this user
        const { data: rooms, error: roomErr } = await supabase
            .from('rooms')
            .select('id')
            .or(`host_id.eq.${userId},partner_id.eq.${userId}`);
            
        if (roomErr) throw roomErr;
        if (!rooms || rooms.length === 0) return [];
        
        roomIds = rooms.map(r => r.id);
    }
    
    // 2. Get card sends for these rooms
    const { data: sends, error: sendsErr } = await supabase
        .from('room_card_sends')
        .select(`
            id, room_id, sender_id, receiver_id, status, sent_at,
            cards ( id, name, power_description, image_url, card_categories (name) )
        `)
        .in('room_id', roomIds)
        .order('sent_at', { ascending: false })
        .limit(50);
        
    if (sendsErr) throw sendsErr;
    
    // 3. Format to match frontend SentChallenge
    return sends.map(send => ({
        id: send.id,
        room_id: send.room_id,
        sender_id: send.sender_id,
        receiver_id: send.receiver_id,
        card_id: send.cards?.id,
        status: send.status,
        sent_at: send.sent_at,
        time: send.sent_at ? new Date(send.sent_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'Unknown',
        category: send.cards?.card_categories?.name || 'Card',
        title: send.cards?.name || 'Unknown Card',
        description: send.cards?.power_description || '',
        image: send.cards?.image_url || null
    }));
};

module.exports = {
    createRoom,
    joinRoom,
    getActiveRoom,
    leaveRoom,
    getRoomHistory
};
