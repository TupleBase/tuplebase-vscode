# Kafka demo (npm run db:kafka) — bind to the local-kafka connection.
# Commands are line-based: cmd+enter runs the line under the cursor.

# List every topic with its partition count (`list` is an alias)
topics

# Per-partition metadata for a topic: leader, replicas, earliest + latest offset
describe crew

# Tail the last N messages → partition / offset / key / value / timestamp.
# Reads from offset (latest - N), NOT 0, so you see the most recent messages.
consume crew 10

# Smaller N starts closer to the end (skips older offsets)
consume crew 2

# No count → defaults to the page size (capped); `tail` is an alias for `consume`
tail crew
