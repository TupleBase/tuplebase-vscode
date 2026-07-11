-- PartiQL against local-dynamo — cmd+enter runs the statement under the cursor
SELECT * FROM voyages;
SELECT * FROM voyages WHERE crew_name='ada';
SELECT * FROM crew_profiles WHERE crew_name='grace';
SELECT * FROM maintenance_jobs WHERE boat_id='boat-3';

-- Mutations (PartiQL) — blocked on a read-only connection
INSERT INTO voyages VALUE {'voyage_id':'v-900','crew_name':'ada','status':'planned'};
UPDATE voyages SET status='underway' WHERE voyage_id='v-900';
DELETE FROM voyages WHERE voyage_id='v-900';
