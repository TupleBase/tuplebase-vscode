# Kafka demo (npm run db:kafka) — bind to the local-kafka connection.
# Commands are line-based: cmd+enter runs the line under the cursor.
# NOTE: topics/describe/consume is a Rowboat command syntax, not an official
# Kafka query language — Kafka has none (this mirrors the CLI verbs).

# List every topic with its partition count (`list` is an alias)
topics

# Per-partition metadata: leader, replicas, earliest + latest offset
describe crew

# voyages has 3 partitions — describe shows each one
describe voyages

# Tail the last N messages → partition / offset / key / value / timestamp.
# Reads from offset (latest - N), NOT 0, so you see the most recent messages.
consume crew 10

# Multi-partition tail: last N per partition, merged and sorted
consume voyages 5

# Smaller N starts closer to the end (skips older offsets)
consume ports 2

# No count → defaults to the page size (capped); `tail` is an alias for `consume`
tail maintenance
