import * as mqtt from "mqtt"
import MqttRequest from "mqtt-request"
import PGClient from "pg-native"

const db = new PGClient()
db.connectSync(process.env.CONNECTION_STRING)

const client = mqtt.connect(process.env.BROKER_URL)
/** @type {MqttRequest}*/
const mqttReq = new MqttRequest.default(client);

console.log(`Broker URL: ${process.env.BROKER_URL}`)

mqttReq.response("demo", payload => {
    payload = JSON.parse(payload)
    payload.message += " and hi from scheduling-service"
    console.log(payload)
    return JSON.stringify(payload)
})

// Timeslot functionality
mqttReq.response("v1/timeslots", (payload) => {
    
    payload = JSON.parse(payload);
    console.log(payload)

    if (!payload.startTime)
        return JSON.stringify({ httpStatus: 400, message: "Start time needs to be specified." })

    try {
        db.querySync("select * from public.timeslot where start_time = $1", [payload.startTime || Date.now()])
        return JSON.stringify({ httpStatus: 201, message: `${payload}` })
    } catch (e) {
        return JSON.stringify({ httpStatus: 400, message: "Timeslots with this start time not found."})
    }
});

// User functionality
mqttReq.response("v1/users/:userId", (payload) => {
    
    payload = JSON.parse(payload);
    console.log(payload)

    if (!payload.userID)
        return JSON.stringify({ httpStatus: 404, message: "User ID not found." })

    try {
        db.querySync("select * from public.user where id = $1", [payload.userID])
        return JSON.stringify({ httpStatus: 201, message: `${payload}` })
    } catch (e) {
        return JSON.stringify({ httpStatus: 500, message: "Internal Server Error"})
    }
});

mqttReq.response("v1/users/:userId/notifications", (payload) => {
    
    payload = JSON.parse(payload);
    console.log(payload)

    if (!payload.userID)
        return JSON.stringify({ httpStatus: 404, message: "User ID not found." })

    try {
        const notifications = db.querySync("select notifications from public.user where id = $1", [payload.userID])
        return JSON.stringify({ httpStatus: 200, message: `${notifications}` })
    } catch (e) {
        return JSON.stringify({ httpStatus: 500, message: "Internal Server Error"})
    }
});

mqttReq.response("v1/users/:userId/appointments", (payload) => {
    
    payload = JSON.parse(payload);
    console.log(payload)

    if (!payload.userID)
        return JSON.stringify({ httpStatus: 404, message: "User ID not found." })

    try {
        const appointments = db.querySync("select appointments from public.user where id = $1", [payload.userID])
        return JSON.stringify({ httpStatus: 200, message: `${appointments}` })
    } catch (e) {
        return JSON.stringify({ httpStatus: 500, message: "Internal Server Error"})
    }
});

client.on("connect", () => {
    console.log("scheduling-service connected to broker")
});
