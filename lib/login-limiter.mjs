import {createHmac, randomBytes} from 'node:crypto';

// This is deliberately PostgreSQL-backed: replicas and restarts share limits.
// Reserve an attempt before bcrypt; release only this attempt on success. Failed
// and in-flight attempts count together, preventing concurrent quota bypass.
export async function createLoginLimiter(pool, {
  clock = Date.now, windowMs = 15 * 60_000, burstMax = 120, failureMax = 15,
} = {}) {
  for (const n of [windowMs,burstMax,failureMax])
    if (!Number.isSafeInteger(n) || n < 1) throw Error('Invalid login limit configuration');
  await pool.query("INSERT INTO auth_security_keys(name,secret) VALUES('login-limiter',$1) ON CONFLICT DO NOTHING",[randomBytes(32).toString('hex')]);
  const secret=(await pool.query("SELECT secret FROM auth_security_keys WHERE name='login-limiter'")).rows[0].secret;
  const key=(scope,value)=>createHmac('sha256',secret).update(scope+'\0'+value).digest('hex');
  const normalize=value=>{
    if(typeof value!=='string')return '';
    let v=value.trim().toLowerCase().slice(0,200);
    if(!v.includes('@')){
      const phone=v.replace(/[ .()-]/g,'').replace(/^\+84/,'0');
      if(/^0[35789]\d{8}$/.test(phone))v=phone;
    }
    return v;
  };
  async function take(k,max,now){
    const row=(await pool.query(`INSERT INTO auth_rate_limits(key,count,expires_at) VALUES($1,1,$2)
      ON CONFLICT(key) DO UPDATE SET
        count=CASE WHEN auth_rate_limits.expires_at<=$3 THEN 1 ELSE LEAST(auth_rate_limits.count+1,$4+1) END,
        expires_at=CASE WHEN auth_rate_limits.expires_at<=$3 THEN $2 ELSE auth_rate_limits.expires_at END
      RETURNING count,expires_at`,[k,now+windowMs,now,max])).rows[0];
    if(row.count>max)throw Object.assign(new Error('Bạn đã thử quá nhiều lần. Vui lòng thử lại sau.'),{
      status:429,error:'rate_limited',retryAfter:Math.max(1,Math.ceil((row.expires_at-now)/1000)),
    });
    return {key:k,expiresAt:row.expires_at};
  }
  return {
    async reserve(ip,identifier){
      const now=clock();
      await pool.query('DELETE FROM auth_rate_limits WHERE key IN (SELECT key FROM auth_rate_limits WHERE expires_at<=$1 LIMIT 100)',[now]);
      await take(key('burst',ip),burstMax,now);
      return take(key('failure',ip+'\0'+normalize(identifier)),failureMax,now);
    },
    async success(lease){
      await pool.query('UPDATE auth_rate_limits SET count=GREATEST(0,count-1) WHERE key=$1 AND expires_at=$2',[lease.key,lease.expiresAt]);
    },
  };
}
