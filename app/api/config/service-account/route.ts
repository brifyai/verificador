import { NextResponse } from 'next/server';

export async function GET() {
  // Solo devolvemos el email para mostrarlo en el frontend
  // No exponemos la clave privada ni otros secretos
  return NextResponse.json({ 
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '' 
  });
}
