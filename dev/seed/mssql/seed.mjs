// Seed the dev SQL Server container. The mssql image has no initdb hook, so this
// runs after the container is healthy (wired into `npm run db:seed -- mssql`).
import mssql from 'mssql'

const base = {
  server: 'localhost', port: 1433, user: 'sa', password: 'TupleBase!Pass1',
  options: { encrypt: false, trustServerCertificate: true },
}

const master = await new mssql.ConnectionPool({ ...base, database: 'master' }).connect()
await master.request().batch("if db_id('tuplebase') is null create database tuplebase")
await master.close()

const db = await new mssql.ConnectionPool({ ...base, database: 'tuplebase' }).connect()
await db.request().batch("if object_id('dbo.crew') is not null drop table dbo.crew")
await db.request().batch(
  'create table dbo.crew (id int primary key, name nvarchar(50) not null, role nvarchar(50) not null)',
)
await db.request().batch(
  "insert into dbo.crew (id, name, role) values (1, 'ada', 'captain'), (2, 'grace', 'navigator'), (3, 'hedy', 'engineer')",
)
await db.close()
console.log('seeded mssql: tuplebase.dbo.crew (3 rows)')
