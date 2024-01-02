import PGClient from "pg-native"
const db = new PGClient()
db.connectSync(process.env.CONNECTION_STRING)

export default db