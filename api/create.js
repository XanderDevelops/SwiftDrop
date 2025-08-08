import { kv } from '@vercel/kv';

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method Not Allowed' });
  }

  // Generate a unique 6-digit code
  let code;
  let roomExists = true;
  while (roomExists) {
    code = Math.floor(100000 + Math.random() * 900000).toString();
    // Check if a room with this code already exists
    const existingRoom = await kv.get(`room_${code}`);
    if (!existingRoom) {
      roomExists = false;
    }
  }
  
  const { offer } = request.body;
  
  // Store the offer with a 5-minute expiration time
  await kv.set(`room_${code}`, JSON.stringify({ offer }), { ex: 300 });

  return response.status(200).json({ code });
}