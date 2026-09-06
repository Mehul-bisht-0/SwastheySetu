/** STATUS: Implemented — run regularly using the intended database environment. */
import { purgeExpired } from '../apps/api/src/modules/assignments/repo.ts';
import { purgeExpired as purgeExpiredIvr } from '../apps/api/src/modules/ivr/repo.ts';
import { withTransaction } from '../apps/api/src/db/tx.ts';
import { closePool } from '../apps/api/src/db/pool.ts';
try {
  const assignments=await purgeExpired();
  const ivr=await withTransaction(db => purgeExpiredIvr(db));
  console.log({ assignments,ivr });
}
finally { await closePool(); }
