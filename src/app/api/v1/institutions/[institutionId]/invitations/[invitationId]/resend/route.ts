import {manageInvitation} from '@/shared/invitations/admin-handlers';
export const runtime='nodejs';
export const POST=manageInvitation('resend');
