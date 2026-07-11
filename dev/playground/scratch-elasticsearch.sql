/* Elasticsearch demo (npm run db:elasticsearch) — bind to the local-elasticsearch
   connection. <METHOD> <path> [json body], Kibana-console style; end each with `;`. */
GET /crew/_search {"query": {"match_all": {}}};

GET /crew/_search {"query": {"match": {"role": "captain"}}};

GET /_cat/indices?format=json;

/* Write — a read-only connection blocks this */
POST /crew/_doc {"id": 4, "name": "lin", "role": "cook"};
