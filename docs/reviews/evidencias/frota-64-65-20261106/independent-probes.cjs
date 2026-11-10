const assert = require('node:assert/strict');
const { randomUUID, createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { createApp } = require('/app/src/app.ts');
const { seedRolesAndPermissions } = require('/app/src/database/scripts/seed.ts');
const { seedRbacTestUsers, RBAC_JWT_CONFIG } = require('/app/tests/fixtures/rbac-users.fixture.ts');
const { getTestPool, setupTestDatabase, truncateTestDatabase, closeTestPool } = require('/app/tests/helpers/db-test.ts');
const { FuelingsService } = require('/app/src/services/fuelings.service.ts');
const { FuelingsRepository } = require('/app/src/repositories/fuelings.repository.ts');
const { VehiclesRepository } = require('/app/src/repositories/vehicles.repository.ts');
const { AuditRepository } = require('/app/src/repositories/audit.repository.ts');
const { AuditService } = require('/app/src/services/audit.service.ts');
const meta = { reportedBy: 'Equipe Fictícia de Validação Independente', reason: 'Conferência fictícia QA', evidenceDescription: 'Comprovante fictício independente' };
let pool, server, base, users, vehicleId;
const results = [];
function body(changes = {}) { return { ...meta, vehicleId, fueledAt: '2026-10-02T12:00:00Z', fuelType: 'DIESEL', liters: '1.001', totalValue: '2.01', odometerKm: 100, ...changes }; }
async function api(path, method = 'GET', data, role = 'GESTOR', key = randomUUID()) {
  const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${users.get(role).token}`, 'Idempotency-Key': key }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
  return { status: response.status, data: await response.json() };
}
async function ok(path, method, data, role, key) { const r = await api(path, method, data, role, key); assert.equal(r.status, method === 'POST' ? 201 : 200, JSON.stringify(r)); return r.data; }
async function ledger() { return Promise.all(['fleet.fuelings', 'fleet.fueling_events', 'trip.odometer_readings', 'audit.logs'].map(async table => (await pool.query(`SELECT to_jsonb(t) AS row FROM ${table} t ORDER BY id`)).rows)); }
async function reset() {
  await truncateTestDatabase(); await seedRolesAndPermissions(pool); users = await seedRbacTestUsers(pool);
  vehicleId = (await pool.query("INSERT INTO fleet.vehicles (license_plate,categories,seats,body_limit,operation_type) VALUES ('QAI1A64',ARRAY['BODY'],2,2,'SVO') RETURNING id::text")).rows[0].id;
}
async function legacy(at, revision = 1, predecessor = null) {
  return (await pool.query("INSERT INTO fleet.fuelings(vehicle_id,fueled_at,fuel_type,liters,total_value,odometer_km,created_by,revision,supersedes_id) VALUES($1,$2,'DIESEL',1,2,100,$3,$4,$5) RETURNING id::text", [vehicleId, at, users.get('GESTOR').id, revision, predecessor])).rows[0].id;
}
async function probe(id, description, fn) { await reset(); const evidence = await fn(); results.push({ id, description, status: 'PASSOU', evidence }); }
function safeKeys(value) {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) { assert.doesNotMatch(key, /^(cpf|cnh.*|phone|password.*|token|request_?key|request_?payload)$/i); safeKeys(child); }
}
async function main() {
  const url = new URL(process.env.DATABASE_URL_TEST);
  assert.equal(url.pathname, '/aratu_test');
  await setupTestDatabase(); pool = getTestPool();
  const environment = (await pool.query("SELECT current_database() AS database, current_setting('server_version') AS postgres")).rows[0];
  assert.equal(environment.database, 'aratu_test');
  const hashes = Object.fromEntries(['src/app.ts','src/services/fuelings.service.ts','src/repositories/fuelings.repository.ts','tests/fuelings.integration.test.ts'].map(file => [file, createHash('sha256').update(readFileSync('/app/' + file)).digest('hex')]));
  server = createApp({ pool, jwtConfig: RBAC_JWT_CONFIG }).listen(0);
  await new Promise(resolve => server.once('listening', resolve)); base = `http://127.0.0.1:${server.address().port}`;
  await probe('P1', 'GESTOR e ADMINISTRADOR operam os quatro endpoints; respostas sem campos restritos', async () => {
    const statuses = [];
    for (const role of ['GESTOR','ADMINISTRADOR']) {
      const first = await ok('/fuelings', 'POST', body(), role);
      const list = await ok('/fuelings', 'GET', undefined, role);
      const detail = await ok('/fuelings/' + first.id, 'GET', undefined, role);
      const second = await ok('/fuelings/' + first.id, 'PUT', { ...meta, expectedRevision: 1, notes: 'Nota fictícia independente' }, role);
      [first,list,detail,second].forEach(safeKeys); assert.equal(second.createdBy, users.get(role).id);
      statuses.push({ role, POST: 201, GET: 200, detail: 200, PUT: 200 });
    }
    return statuses;
  });
  await probe('P2', 'R1: somente notas em legado com .000001 preserva SQL exato nas três trilhas', async () => {
    const id = await legacy('2026-10-02T12:00:00.000001Z');
    const original = (await pool.query('SELECT to_jsonb(f) AS row FROM fleet.fuelings f WHERE id=$1', [id])).rows;
    const second = await ok('/fuelings/' + id, 'PUT', { ...meta, expectedRevision: 1, notes: 'Nota retificada fictícia' });
    assert.equal(second.fueledAt, '2026-10-02T12:00:00.000001Z');
    const checks = (await pool.query('SELECT f.fueled_at=o.fueled_at AS fact,r.occurred_at=o.fueled_at AS reading,e.occurred_at=o.fueled_at AS event FROM fleet.fuelings f JOIN fleet.fuelings o ON o.id=f.supersedes_id JOIN trip.odometer_readings r ON r.fueling_id=f.id JOIN fleet.fueling_events e ON e.fueling_id=f.id WHERE f.id=$1',[second.id])).rows;
    assert.deepEqual(checks,[{fact:true,reading:true,event:true}]);
    assert.deepEqual((await pool.query('SELECT to_jsonb(f) AS row FROM fleet.fuelings f WHERE id=$1',[id])).rows,original);
    return { fueledAt: second.fueledAt, checks, originalUnchanged: true };
  });
  await probe('P3', 'R2: datas pré-1970, microssegundos adjacentes, offset, igualdade, replay, período e ordem', async () => {
    const a = await ok('/fuelings','POST',body({fueledAt:'1969-12-31T23:59:59.999997Z',odometerKm:100}));
    const b = await ok('/fuelings','POST',body({fueledAt:'1969-12-31T23:59:59.999998Z',odometerKm:101}));
    const key = randomUUID();
    const c = await ok('/fuelings','POST',body({fueledAt:'1969-12-31T20:59:59.999999-03:00',odometerKm:102}), 'GESTOR',key);
    assert.equal(c.fueledAt,'1969-12-31T23:59:59.999999Z');
    assert.deepEqual(await ok('/fuelings','POST',body({fueledAt:c.fueledAt,odometerKm:102}),'GESTOR',key),c);
    assert.equal((await api('/fuelings','POST',body({fueledAt:c.fueledAt,odometerKm:101}))).status,422);
    const d=await ok('/fuelings','POST',body({fueledAt:'1970-01-01T00:00:00Z',odometerKm:103}));
    const list=await ok('/fuelings'); assert.deepEqual(list.items.map(v=>v.id),[d.id,c.id,b.id,a.id]);
    const period=await ok('/fuelings?'+new URLSearchParams({from:b.fueledAt,to:d.fueledAt}));
    assert.deepEqual(period.items.map(v=>v.id),[c.id,b.id]);
    return { orderedInstants:list.items.map(v=>v.fueledAt),halfOpenInstants:period.items.map(v=>v.fueledAt),equalKmConflict:422,replay:'mesmo ID' };
  });
  await probe('P4', 'R2: um microssegundo futuro é recusado com banco real e relógio fixo', async () => {
    const service = new FuelingsService(new FuelingsRepository(pool),new VehiclesRepository(pool),new AuditService(new AuditRepository(pool)),()=>new Date('2026-10-02T12:00:00.123Z'));
    const before=await ledger();
    await assert.rejects(service.create(body({fueledAt:'2026-10-02T12:00:00.123001Z'}),users.get('GESTOR').id,randomUUID()),{code:'FUTURE_DATE'});
    assert.deepEqual(await ledger(),before);
    const exact=await service.create(body({fueledAt:'2026-10-02T12:00:00.123000Z'}),users.get('GESTOR').id,randomUUID());
    assert.equal(exact.fueledAt,'2026-10-02T12:00:00.123Z');
    return {future:'FUTURE_DATE',noPartialWrites:true,exactReturned:exact.fueledAt};
  });
  await probe('P5', 'R2: excesso de precisão HTTP, intervalos invertidos, offset fracionário e três casas', async () => {
    const key=randomUUID(); const first=await ok('/fuelings','POST',body({fueledAt:'2026-10-02T17:30:00.12345+05:30'}),'GESTOR',key);
    assert.equal(first.fueledAt,'2026-10-02T12:00:00.123450Z');
    assert.deepEqual(await ok('/fuelings','POST',body({fueledAt:'2026-10-02T12:00:00.123450Z'}),'GESTOR',key),first);
    const snapshot=await ledger(); const tooPrecise='2026-10-02T12:00:00.1234567Z';
    assert.equal((await api('/fuelings','POST',body({fueledAt:tooPrecise}))).status,400);
    assert.equal((await api('/fuelings/'+first.id,'PUT',{...meta,expectedRevision:1,fueledAt:tooPrecise})).status,400);
    for(const filters of [{from:tooPrecise},{from:'2026-10-02T12:00:00.123451Z',to:first.fueledAt},{from:first.fueledAt,to:first.fueledAt}]) assert.equal((await api('/fuelings?'+new URLSearchParams(filters))).status,400);
    assert.deepEqual(await ledger(),snapshot);
    const second=await ok('/fuelings','POST',body({fueledAt:'2026-10-02T12:00:01.120000Z'})); assert.equal(second.fueledAt,'2026-10-02T12:00:01.120Z');
    return {normalized:first.fueledAt,threeDigits:second.fueledAt,invalidRequests:5,noPartialWrites:true};
  });
  await probe('P6', 'R3: revision 5 → 1; revisão alvo errada continua bloqueada e ponta pode ser retificada', async () => {
    const root=await legacy('2026-10-02T12:00:00Z',5); const leaf=await legacy('2026-10-02T12:00:00Z',1,root);
    for(const id of [root,leaf]) assert.equal((await ok('/fuelings/'+id)).currentId,leaf);
    assert.deepEqual((await ok('/fuelings')).items.map(v=>v.id),[leaf]);
    const snapshot=await ledger(); assert.equal((await api('/fuelings/'+leaf,'PUT',{...meta,expectedRevision:5,notes:'Nota fictícia'})).status,409); assert.deepEqual(await ledger(),snapshot);
    const next=await ok('/fuelings/'+leaf,'PUT',{...meta,expectedRevision:1,notes:'Nota fictícia'}); assert.equal(next.revision,2); assert.equal(next.supersedesId,leaf);
    assert.equal((await ok('/fuelings/'+root)).currentId,next.id);
    return {rootRevision:5,leafRevision:1,staleRevision:409,correctedRevision:next.revision,tipAgrees:true};
  });
  await probe('P7', 'QA12/20: rollback de leitura/evento permite reenviar POST e PUT com a mesma chave', async () => {
    let current=await ok('/fuelings','POST',body()); const evidence=[];
    for(const table of ['trip.odometer_readings','fleet.fueling_events']) {
      for(const method of ['POST','PUT']) {
        const key=randomUUID(); const path=method==='POST'?'/fuelings':'/fuelings/'+current.id;
        const data=method==='POST'?body():{...meta,expectedRevision:current.revision,notes:'Reenvio fictício'};
        const snapshot=await ledger();
        await pool.query(`CREATE FUNCTION public.fail_independent_qa() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Falha fictícia independente'; END $$; CREATE TRIGGER fail_independent_qa BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION public.fail_independent_qa()`);
        try { const failed=await api(path,method,data,'GESTOR',key); assert.equal(failed.status,500); assert.deepEqual(failed.data,{erro:'Erro interno do servidor.'}); assert.deepEqual(await ledger(),snapshot); }
        finally { await pool.query(`DROP TRIGGER fail_independent_qa ON ${table}; DROP FUNCTION public.fail_independent_qa()`); }
        const saved=await ok(path,method,data,'GESTOR',key); const after=await ledger();
        assert.deepEqual(await ok(path,method,data,'GESTOR',key),saved); assert.deepEqual(await ledger(),after);
        if(method==='PUT') current=saved;
        evidence.push({table,method,failure:500,retry:method==='POST'?201:200,replayUnchanged:true});
      }
    }
    return evidence;
  });
  await probe('P8', 'QA03/08: PUT rejeita ambas as fronteiras e permite retificar combustível e data', async () => {
    await ok('/fuelings','POST',body({fueledAt:'2026-10-01T12:00:00Z',odometerKm:90}));
    await ok('/fuelings','POST',body({fueledAt:'2026-10-03T12:00:00Z',odometerKm:110}));
    const original=await ok('/fuelings','POST',body()); const snapshot=await ledger();
    for(const km of [89,111]) assert.equal((await api('/fuelings/'+original.id,'PUT',{...meta,expectedRevision:1,odometerKm:km})).status,422);
    assert.deepEqual(await ledger(),snapshot);
    const changed=await ok('/fuelings/'+original.id,'PUT',{...meta,expectedRevision:1,fuelType:'GASOLINE',fueledAt:'2026-10-02T13:00:00.123456Z',odometerKm:105});
    assert.equal(changed.fuelType,'GASOLINE'); assert.equal(changed.fueledAt,'2026-10-02T13:00:00.123456Z'); assert.equal(changed.odometerKm,105);
    assert.deepEqual((await ok('/fuelings/'+original.id)).fueling,original);
    const malformed=await fetch(base+'/fuelings',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${users.get('GESTOR').token}`},body:'{"liters":'});
    assert.equal(malformed.status,400); assert.deepEqual(await malformed.json(),{erro:'O corpo da requisição deve conter JSON válido.'});
    return {lowerBound:422,upperBound:422,fuelType:changed.fuelType,changedFueledAt:changed.fueledAt,oldVersionUnchanged:true,malformedJson:400};
  });
  console.log(JSON.stringify({environment,baseUrl:base,sourceHashes:hashes,passed:results.length,failed:0,results},null,2));
}
main().catch(error=>{console.error(JSON.stringify({passed:results.length,results,error:String(error),stack:error.stack},null,2));process.exitCode=1;}).finally(async()=>{if(server)await new Promise(resolve=>server.close(resolve));await closeTestPool();});
