import { kv } from '@vercel/kv';

export default async function handler(request, response) {
  try {
    const { code } = request.query;

    if (!code) {
        return response.status(400).json({ error: 'Room code is required.' });
    }

    // GET: Fetch room data
    if (request.method === 'GET') {
      const room = await kv.get(`room_${code}`);
      if (!room) {
        return response.status(404).json({ error: 'Room not found or expired.' });
      }
      return response.status(200).json(room);
    }

    // POST: Add the receiver's answer to the room
    if (request.method === 'POST') {
      const { answer } = request.body;
      if (!answer) {
        return response.status(400).json({ error: 'Missing answer in request body.' });
      }

      const room = await kv.get(`room_${code}`);
      if (!room) {
        return response.status(404).json({ error: 'Room not found or expired.' });
      }
      
      const updatedRoom = { ...room, answer };
      await kv.set(`room_${code}`, JSON.stringify(updatedRoom), { ex: 300 });

      return response.status(200).json({ success: true });
    }

    return response.status(405).json({ error: 'Method Not Allowed' });

  } catch (error) {
    // Catches database connection errors
    console.error(`Error in /api/room for code ${request.query.code}:`, error);
    return response.status(500).json({ 
        error: 'Could not connect to the database. Please ensure Vercel KV is set up correctly.',
        details: error.message 
    });
  }
}