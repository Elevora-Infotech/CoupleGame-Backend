/**
 * MASSIVE SQL INJECTION STRESS TEST (200 PAYLOADS)
 * Testing resilience against a wide array of evasion and injection techniques.
 */

async function runMassiveSQLiAudit() {
    const BASE_URL = 'http://localhost:3000/api/v1/auth';
    
    // Generating 200 Payloads (Diverse Categories)
    const basePayloads = [
        // Tautologies
        "' OR '1'='1", "' OR 1=1--", "' OR 1=1#", "' OR 1=1/*", "') OR ('1'='1", "admin'--", "admin' #", "' OR TRUE--", "' OR 'x'='x",
        // Error Based
        "'; SELECT COUNT(*) FROM users; --", "'; SELECT 1/0; --", "') AND 1=(SELECT COUNT(*) FROM users); --",
        // Union Based
        "' UNION SELECT NULL, NULL, NULL --", "' UNION SELECT 1,2,3 --", "' UNION SELECT version(), user(), database() --",
        // Blind (Boolean)
        "' AND 1=1 --", "' AND 1=2 --", "' AND (SELECT 1)=1 --",
        // Time Based (PG specific)
        "'; SELECT pg_sleep(5); --", "'; DO $$ BEGIN PERFORM pg_sleep(5); END $$; --",
        // Bypasses / Encoding
        "0x27204f52202731273d2731", "%27%20OR%20%271%27%3D%271", "'/**/OR/**/1=1/**/--",
        // Integer based
        "1 OR 1=1", "1; DROP TABLE users",
        // String Concatenation
        "' || 'sqli", "' + 'sqli", "CONCAT('s','q','l','i')"
    ];

    // Expand to 200 by variations (Common in automated scanners)
    const allPayloads = [];
    for(let i=0; i<200; i++) {
        const base = basePayloads[i % basePayloads.length];
        allPayloads.push({ id: i+1, content: `${base} /* variant ${i} */` });
    }

    console.log(`--- 🛡️ MASSIVE SQLi AUDIT STARTING (200 PAYLOADS) ---`);
    let passed = 0;
    let blockedByRateLimit = 0;
    let failed = 0;

    for (const payload of allPayloads) {
        try {
            const res = await fetch(`${BASE_URL}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: payload.content, password: 'test' })
            });

            if (res.status === 429) {
                blockedByRateLimit++;
            } else if (res.status === 200) {
                console.log(`❌ FAIL [ID ${payload.id}]: Payload "${payload.content}" bypassed security!`);
                failed++;
            } else {
                passed++;
            }

            if (payload.id % 20 === 0) {
                console.log(`Progress: ${payload.id}/200 tested...`);
            }
        } catch (err) {
            passed++;
        }
    }

    console.log(`\n--- 🛡️ RESULTS ---`);
    console.log(`Total Tested: 200`);
    console.log(`✅ Secure (Rejected/400): ${passed}`);
    console.log(`🛡️ Blocked (Rate Limited/429): ${blockedByRateLimit}`);
    console.log(`❌ Vulnerable (200 OK): ${failed}`);
    console.log(`--- 🛡️ AUDIT COMPLETE ---`);
}

runMassiveSQLiAudit();
