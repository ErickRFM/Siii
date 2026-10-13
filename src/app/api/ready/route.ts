import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({ status: 'ready', timestamp: new Date().toISOString() });
}