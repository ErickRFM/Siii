import {randomUUID} from 'node:crypto';
import type {Transaction} from '@/shared/http/request-context';
import {enqueueAcademicSection} from './enqueue';

/**
 * Called inside an already authorized, domain-checked academic write transaction.
 * Never issues a network request: the immutable snapshot and its source version
 * commit atomically with the academic mutation and audit entry.
 *
 * The existing outbox feature flag remains off by default. An explicitly
 * enabled, misconfigured outbox aborts the academic write rather than silently
 * dropping a source change and leaving Compañero with stale permissions.
 */
export async function queueCompanionSectionSnapshot(
 tx:Transaction,
 scope:{institutionId:string;sectionId:string;actorUserId:string},
):Promise<void>{
 await enqueueAcademicSection(tx,{...scope,requestId:randomUUID()});
}
