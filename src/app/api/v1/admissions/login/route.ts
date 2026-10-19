import { NextResponse } from 'next/server';
import argon2 from 'argon2';
import { eq } from 'drizzle-orm';
import { db } from '@/infrastructure/database';
import { applicantProfiles } from '../../../../../../db/schema';
import { applicantLoginSchema } from '@/modules/admissions/validation';

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const parseResult = applicantLoginSchema.safeParse(json);
    if (!parseResult.success) {
      return NextResponse.json({ error: { code: 'INVALID_INPUT', message: 'Datos de acceso no válidos' } }, { status: 400 });
    }

    const { email, password } = parseResult.data;

    const [profile] = await db.select().from(applicantProfiles).where(eq(applicantProfiles.email, email)).limit(1);
    if (!profile) {
      return NextResponse.json({ error: { code: 'INVALID_CREDENTIALS', message: 'Correo o contraseña incorrectos' } }, { status: 401 });
    }

    const validPassword = await argon2.verify(profile.passwordHash, password);
    if (!validPassword) {
      return NextResponse.json({ error: { code: 'INVALID_CREDENTIALS', message: 'Correo o contraseña incorrectos' } }, { status: 401 });
    }

    if (!profile.emailVerifiedAt) {
      return NextResponse.json({ error: { code: 'EMAIL_NOT_VERIFIED', message: 'Debes verificar tu correo electrónico antes de iniciar sesión' } }, { status: 403 });
    }

    return NextResponse.json({
      data: {
        applicant: {
          id: profile.id,
          email: profile.email,
          firstName: profile.firstName,
          lastName: profile.lastName,
          phone: profile.phone,
          curp: profile.curp,
        },
      },
    }, { status: 200 });
  } catch {
    return NextResponse.json({ error: { code: 'LOGIN_FAILED', message: 'No se pudo iniciar sesión de aspirante' } }, { status: 500 });
  }
}
