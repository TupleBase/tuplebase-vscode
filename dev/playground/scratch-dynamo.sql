-- PartiQL against local-dynamo — cmd+enter runs the statement under the cursor
SELECT * FROM voyages;
SELECT * FROM voyages WHERE crew_name='ada';
SELECT * FROM crew_profiles WHERE crew_name='grace';
SELECT * FROM maintenance_jobs WHERE boat_id='boat-3';

-- Mutations (PartiQL) — blocked on a read-only connection
INSERT INTO voyages VALUE {'voyage_id':'v-900','crew_name':'ada','status':'planned'};
UPDATE voyages SET status='underway' WHERE voyage_id='v-900';
DELETE FROM voyages WHERE voyage_id='v-900';

-- Paging demo — part of the standard seed (npm run db:seed) (2,000 items)
SELECT * FROM pagination_demo;                      -- full scan; the grid pages it
SELECT * FROM pagination_demo WHERE bucket = 7;     -- filtered subset
SELECT * FROM pagination_demo WHERE id = 'item-1000';
