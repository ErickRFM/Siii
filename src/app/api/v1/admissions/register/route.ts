import { NextResponse } from 'next/server';
import argon2 from 'argon2';
import crypto from 'node:crypto';
import { db } from '@/infrastructure/database';
import { applicantProfiles } from '../../../../../../db/schema';
import { applicantRegisterSchema } from '@/modules/admissions/validation';
import { digestToken } from '@/shared/auth/session-write';

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const parseResult = applicantRegisterSchema.safeParse(json);
    if (!parseResult.success) {
      return NextResponse.json({ error: { code: 'INVALID_INPUT', message: 'Datos de registro de aspirante no válidos', details: parseResult.error.flatten() } }, { status: 400 });
    }

    const { email, firstName, lastName, password, phone, curp } = parseResult.data;

    const passwordHash = await argon2.hash(password, { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 });
    const rawToken = crypto.randomUUID();
    const verificationTokenHash = digestToken(rawToken);

    const [profile] = await db.insert(applicantProfiles).values({
      email,
      firstName,
      lastName,
      passwordHash,
      phone: phone ?? null,
      curp: curp ?? null,
      emailVerifiedAt: null,
      verificationTokenHash,
    }).onConflictDoNothing().returning({ id: applicantProfiles.id, email: applicantProfiles.email });

    if (!profile) {
      return NextResponse.json({ error: { code: 'EMAIL_ALREADY_EXISTS', message: 'El correo electrónico ya está registrado como aspirante' } }, { status: 409 });
    }

    return NextResponse.json({
      data: {
        id: profile.id,
        email: profile.email,
        verificationToken: rawToken,
        message: 'Registro de aspirante exitoso. Por favor verifica tu correo electrónico para activar tu cuenta.',
      },
    }, { status: 201 });
  } catch {
    return NextResponse.json({ error: { code: 'REGISTRATION_FAILED', message: 'No se pudo completar el registro de aspirante' } }, { status: 500 });
  }
}
