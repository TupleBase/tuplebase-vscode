-- PartiQL against local-dynamo — cmd+enter runs the statement under the cursor
SELECT * FROM voyages;
SELECT * FROM voyages WHERE crew_name='ada';
SELECT * FROM crew_profiles WHERE crew_name='grace';
SELECT * FROM maintenance_jobs WHERE boat_id='boat-3';
