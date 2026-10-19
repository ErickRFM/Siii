import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/infrastructure/database';
import { applicantProfiles } from '../../../../../../db/schema';
import { digestToken } from '@/shared/auth/session-write';

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const { token } = json;

    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: { code: 'INVALID_INPUT', message: 'Token de verificación requerido' } }, { status: 400 });
    }

    const tokenHash = digestToken(token);

    const [profile] = await db.select().from(applicantProfiles)
      .where(eq(applicantProfiles.verificationTokenHash, tokenHash))
      .limit(1);

    if (!profile) {
      return NextResponse.json({ error: { code: 'INVALID_TOKEN', message: 'Token de verificación no válido o expirado' } }, { status: 400 });
    }

    await db.update(applicantProfiles)
      .set({
        emailVerifiedAt: new Date(),
        verificationTokenHash: null,
        updatedAt: new Date(),
      })
      .where(eq(applicantProfiles.id, profile.id));

    return NextResponse.json({
      data: {
        id: profile.id,
        email: profile.email,
        message: 'Correo electrónico verificado exitosamente. Ya puedes iniciar sesión.',
      },
    }, { status: 200 });
  } catch {
    return NextResponse.json({ error: { code: 'VERIFICATION_FAILED', message: 'No se pudo verificar el correo electrónico' } }, { status: 500 });
  }
}
