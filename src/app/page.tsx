import { redirect } from 'next/navigation';

// A public entry point must not query the database before displaying the login.
// Once PostgreSQL is configured, authenticated users can navigate directly to
// /dashboard; its server-side session guard remains the source of truth.
export default function Home() {
  redirect('/login');
}
