import { kv } from '@vercel/kv';

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // Generate a unique 6-digit code
    let code;
    let roomExists = true;
    let attempts = 0;
    while (roomExists && attempts < 10) { // Add a limit to prevent infinite loops
      code = Math.floor(100000 + Math.random() * 900000).toString();
      const existingRoom = await kv.get(`room_${code}`);
      if (!existingRoom) {
        roomExists = false;
      }
      attempts++;
    }

    if (roomExists) {
        // This is extremely unlikely but a good safeguard
        return response.status(500).json({ error: 'Failed to generate a unique room code.' });
    }
    
    const { offer } = request.body;
    if (!offer) {
        return response.status(400).json({ error: 'Missing offer in request body.' });
    }
    
    // Store the offer with a 5-minute expiration time
    await kv.set(`room_${code}`, JSON.stringify({ offer }), { ex: 300 });

    return response.status(200).json({ code });

  } catch (error) {
    // This is the CRUCIAL part. It catches database connection errors.
    console.error('Error in /api/create:', error);
    return response.status(500).json({ 
        error: 'Could not connect to the database. Please ensure Vercel KV is set up correctly.',
        details: error.message 
    });
  }
}