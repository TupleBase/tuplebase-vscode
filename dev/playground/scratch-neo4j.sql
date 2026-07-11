/* Neo4j (Cypher) demo (npm run db:neo4j) — bind to the local-neo4j connection. */
MATCH (c:Crew) RETURN c.id AS id, c.name AS name, c.role AS role ORDER BY c.id;

MATCH (c:Crew) WHERE c.role = 'captain' RETURN c;

/* Mutations — a read-only connection blocks these */
MATCH (c:Crew {name: 'grace'}) SET c.role = 'first mate' RETURN c;

CREATE (:Crew {id: 4, name: 'lin', role: 'cook'});
