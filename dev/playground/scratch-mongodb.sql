/* MongoDB (MQL) demo (npm run db:start -- mongodb && npm run db:seed -- mongodb) — bind to the local-mongodb connection.
   db.<collection>.<method>(...); arguments are strict JSON (double-quote keys). */
db.crew.find({});

db.crew.find({"role": "captain"});

db.crew.aggregate([{"$group": {"_id": "$role", "n": {"$sum": 1}}}]);

/* Mutations — a read-only connection blocks these */
db.crew.updateOne({"name": "grace"}, {"$set": {"role": "first mate"}});

db.crew.insertOne({"id": 4, "name": "lin", "role": "cook"});
