import * as mqtt from "mqtt"
import MqttRequest from "mqtt-request"
import PGClient from "pg-native"
import jwt from "jsonwebtoken"


const client = mqtt.connect(process.env.BROKER_URL)

MqttRequest.timeout = 5000;

export const db = new PGClient()
db.connectSync(process.env.CONNECTION_STRING)


/** @type {MqttRequest}*/
export const mqttReq = new MqttRequest.default(client);

console.log(`Broker URL: ${process.env.BROKER_URL}`)

mqttReq.response("demo", payload => {
    payload = JSON.parse(payload)
    payload.message += " and hi from scheduling-service"
    console.log(payload)
    return JSON.stringify(payload)
})

mqttReq.response("v1/dentists/read", (payload) => {
    payload = JSON.parse(payload)

    try {
        const dentists = db.querySync("SELECT id, name, clinic_id FROM public.user WHERE role = 'dentist'")
        return JSON.stringify({ httpStatus: 200, dentists})
    } catch (e) {
        return JSON.stringify({ httpStatus: 500, message: `Some error occurred` })
    }
});

mqttReq.response("v1/timeslots/delete", (payload) => {
    payload = JSON.parse(payload)

    try {
        const result = db.querySync(
            `DELETE FROM public.timeslot WHERE id = ${payload.timeslotId} AND dentist_id = ${payload.dentistId} RETURNING *`
        );

        if (result && result.length > 0) {
            return JSON.stringify({ httpStatus: 200, timeslot: result });
        } else {
            return JSON.stringify({ httpStatus: 404, message: 'Timeslot or Dentist ID not found' });
        }
    } catch (e) {
        return JSON.stringify({ httpStatus: 500, message: `Some error occurred` });
    }
});

mqttReq.response("v1/timeslots/create", (payload) => {
    payload = JSON.parse(payload)

    try {
        db.querySync("insert into public.timeslot (dentist_id, start_time, end_time) values ($1, $2, $3)", [payload.dentistId, payload.start_time, payload.end_time])
        return JSON.stringify({ httpStatus: 201, message: `Created a new timeslot from ${payload.start_time} to ${payload.end_time}` })
    } catch (e) {
        return JSON.stringify({httpStatus: 500, message: 'Some error occurred'})
    }

});

mqttReq.response("v1/dentists/ratings/create", (payload) => {
    payload = JSON.parse(payload)
    try {
        const rating = parseInt(payload.rating)
        //if there is not dentist with the payload.dentistId -> insert new dentist and new rating
        //don't forget to also send the patient_id -> this table has a compound key of patient_id and dentist_id
        const token = jwt.decode(payload.token)
        console.log(token)
        const dentist = db.querySync(`SELECT * FROM public.patient_on_dentist WHERE dentist_id = ${payload.dentistId}`);
        if (dentist.length === 0){
            db.querySync("insert into public.patient_on_dentist (patient_id, dentist_id, rating) values ($1, $2, $3)", [token.id, payload.dentistId, rating])
        }
        //if there is a dentist in the dentist_on_patient table, just insert a new rating.
        else{
             db.querySync(`UPDATE public.patient_on_dentist SET rating = ${payload.rating} where dentist_id = ${payload.dentistId}`)
        }
        return JSON.stringify({ httpStatus: 201, message: `Posted new rating of ${rating} for dentist with id ${payload.dentistId}`})
    } catch (e) {
        console.log(e)
        return JSON.stringify({ httpStatus: 500, message: `Some error occurred`, errorInternal: e })
    }
});


client.on("connect", () => {
    console.log("scheduling-service connected to broker")
});


