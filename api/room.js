import { kv } from '@vercel/kv';

export default async function handler(request, response) {
  const { code } = request.query;

  // GET: Fetch room data for polling
  if (request.method === 'GET') {
    const room = await kv.get(`room_${code}`);
    if (!room) {
      return response.status(404).json({ error: 'Room not found' });
    }
    return response.status(200).json(room);
  }

  // POST: Add the receiver's answer to the room
  if (request.method === 'POST') {
    const { answer } = request.body;
    const room = await kv.get(`room_${code}`);
    if (!room) {
      return response.status(404).json({ error: 'Room not found' });
    }
    
    // Update the room with the answer
    const updatedRoom = { ...room, answer };
    await kv.set(`room_${code}`, JSON.stringify(updatedRoom), { ex: 300 });

    return response.status(200).json({ success: true });
  }

  return response.status(405).json({ error: 'Method Not Allowed' });
}