import { NextResponse } from 'next/server';

// The setup workflow is deprecated; respond with 410 Gone.
export async function GET() {
  return NextResponse.json({ error: 'Setup endpoint removed' }, { status: 410 });
}

export async function POST() {
  return NextResponse.json({ error: 'Setup endpoint removed' }, { status: 410 });
}

export async function DELETE() {
  return NextResponse.json({ error: 'Setup endpoint removed' }, { status: 410 });
}
