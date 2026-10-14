export async function insertRow(db, table, data) {
  const cols = Object.keys(data)
  const placeholders = cols.map((_, i) => `$${i + 1}`)
  const { rows } = await db.query(
    `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`,
    Object.values(data),
  )
  return rows[0]
}

export async function updateRow(db, table, id, data) {
  const cols = Object.keys(data)
  const set = cols.map((c, i) => `${c} = $${i + 2}`)
  const { rows } = await db.query(
    `UPDATE ${table} SET ${set.join(', ')} WHERE id = $1 RETURNING *`,
    [id, ...Object.values(data)],
  )
  return rows[0] ?? null
}

export async function deleteRow(db, table, id) {
  const { rowCount } = await db.query(`DELETE FROM ${table} WHERE id = $1`, [id])
  return rowCount > 0
}
