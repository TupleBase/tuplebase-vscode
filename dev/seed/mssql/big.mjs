// Large dataset for exercising results paging / grid volume.
// Runs as the second half of the standard seed: `npm run db:seed -- mssql`
import mssql from 'mssql'

const base = {
  server: 'localhost', port: 1433, user: 'sa', password: 'TupleBase!Pass1',
  options: { encrypt: false, trustServerCertificate: true },
}

const master = await new mssql.ConnectionPool({ ...base, database: 'master' }).connect()
await master.request().batch("if db_id('tuplebase') is null create database tuplebase")
await master.close()

const db = await new mssql.ConnectionPool({ ...base, database: 'tuplebase' }).connect()
await db.request().batch("if object_id('dbo.pagination_demo') is not null drop table dbo.pagination_demo")
await db.request().batch(
  'create table dbo.pagination_demo (id int primary key, label nvarchar(50) not null, bucket int not null, amount decimal(10,2) not null, created_at datetime2 not null)',
)

const COUNT = 10000
for (let start = 1; start <= COUNT; start += 1000) {
  // T-SQL caps a VALUES list at 1000 rows per INSERT
  const values = []
  for (let i = start; i < start + 1000 && i <= COUNT; i++) {
    values.push(`(${i}, 'row-${i}', ${i % 50}, ${(i * 7) % 1000}, dateadd(minute, -${i}, sysdatetime()))`)
  }
  await db.request().batch(
    `insert into dbo.pagination_demo (id, label, bucket, amount, created_at) values ${values.join(',')}`,
  )
}
await db.close()
console.log(`seeded mssql big: tuplebase.dbo.pagination_demo (${COUNT} rows)`)
