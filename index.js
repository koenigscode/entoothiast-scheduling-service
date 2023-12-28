import * as mqtt from "mqtt"
import MqttRequest from "mqtt-request"
import PGClient from "pg-native"
import jwt from "jsonwebtoken"

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

mqttReq.response("v1/clinics/read", (payload) => {
    payload = JSON.parse(payload)
    console.log(payload)

    try {
        const clinics = db.querySync('SELECT * FROM public.clinic')
        return JSON.stringify({ httpStatus: 200, clinics})
    } catch (e) {
        return JSON.stringify({ httpStatus: 400, message: "No clinics found"})
    }
})
mqttReq.response("v1/timeslots", (payload) => {
    
    payload = JSON.parse(payload);
    console.log(payload)

    if (!payload.startTime)
        return JSON.stringify({ httpStatus: 400, message: "Start time needs to be specified." })

    try {
        db.querySync("select from public.timeslot where start_time = $1", [payload.startTime || Date.now()])
        return JSON.stringify({ httpStatus: 201, message: `${payload}` })
    } catch (e) {
        return JSON.stringify({ httpStatus: 400, message: "Timeslots with this start time not found."})
    }
});

mqttReq.response("v1/appointments/all", (payload) => {
    payload = JSON.parse(payload)

    try {
        const token = jwt.decode(payload.token)
        const appointments = db.querySync(`SELECT appointment.id AS appointment_id, appointment.*, timeslot.*, "user".name AS patient_name
        FROM appointment
        JOIN timeslot ON timeslot.id = appointment.timeslot_id
        JOIN "user" ON "user".id = appointment.patient_id
        WHERE appointment.dentist_id = $1`, [token.id])
        return JSON.stringify({ httpStatus: 200, appointments})
    } catch (e) {
        return JSON.stringify({ httpStatus: 500, message: `Some error occurred` })
    }
});

mqttReq.response("v1/appointments/create", (payload) => {
    payload = JSON.parse(payload);
    console.log('Received payload:', payload);
        if (!payload.patient_id|| !payload.dentist_id || !payload.timeslot_id)
        return JSON.stringify({ httpStatus: 400, message: "Patient ID, Dentist ID, Timeslot ID do not exist" })

    try {
        const result = db.querySync(
            "INSERT INTO public.appointment (patient_id, dentist_id, timeslot_id, cancelled, confirmed) VALUES ($1, $2, $3, $4, $5) RETURNING *",
            [payload.patient_id, payload.dentist_id, payload.timeslot_id, payload.cancelled, payload.confirmed]
        );
        const appointment= result[0]
        return JSON.stringify({ httpStatus: 201, appointment, message: `Appointment created` });
    } catch (error) {
        console.error('Error processing appointment creation:', error);
        return JSON.stringify({ httpStatus: 500, message: "Cannot create appointment" });
    }
});

mqttReq.response("v1/appointments/read", (payload) => {
    payload = JSON.parse(payload);
    console.log('Received payload:', payload);
    const appointmentId = parseInt(payload.appointmentId, 10);
    if (isNaN(appointmentId)) {
        return JSON.stringify({ httpStatus: 400, message: 'Invalid payload. Appointment ID is not a valid number.' });
    }
    try {
        const result = db.querySync('SELECT * FROM public.appointment WHERE id = $1', [appointmentId]);
        if (result.length === 0) {
            return JSON.stringify({ httpStatus: 404, message: 'Appointment not found' });
        }
        const appointment = result[0];
        return JSON.stringify({ httpStatus: 200, appointment });
    } catch (error) {
        console.error('Error retrieving appointment:', error);
        return JSON.stringify({ httpStatus: 500, message: 'Internal Server Error' });
    }
});

mqttReq.response("v1/appointments/update", (payload) => {
    payload = JSON.parse(payload);
    console.log('Received payload:', payload);
    const appointmentId = parseInt(payload.appointmentId, 10);
    const requestBody = payload.requestBody;

    //check if appointment id is an integer
    if (isNaN(appointmentId)) {
        return JSON.stringify({ httpStatus: 400, message: 'Invalid payload. Appointment ID is not a valid number.' });
    }

    try {
        const currentAppointment = db.querySync('SELECT * FROM public.appointment WHERE id = $1', [appointmentId]);

        if (currentAppointment.length === 0) {
            return JSON.stringify({ httpStatus: 404, message: `Appointment with ID ${appointmentId} not found.` });
        }

        const updateFields = [];
        const updateValues = [];

        // Check and add fields to be updated
        if (requestBody.patient_id !== undefined) {
            updateFields.push(`patient_id = ${requestBody.patient_id}`);
        }

        if (requestBody.dentist_id !== undefined) {
            updateFields.push(`dentist_id = ${requestBody.dentist_id}`);
        }

        if (requestBody.timeslot_id !== undefined) {
            updateFields.push(`timeslot_id = ${requestBody.timeslot_id}`);
        }

        if (requestBody.cancelled !== undefined) {
            updateFields.push(`cancelled = ${requestBody.cancelled}`);
        }

        if (requestBody.confirmed !== undefined) {
            updateFields.push(`confirmed = ${requestBody.confirmed}`);
        }

        if (updateFields.length === 0) {
            return JSON.stringify({ httpStatus: 400, message: 'No fields provided for update.' });
        }

        //update fields in the database
        const updateQuery = `UPDATE public.appointment SET ${updateFields.join(', ')} WHERE id = $1 RETURNING *`;

        const result = db.querySync(updateQuery, [appointmentId]);
        const updatedAppointment = result.length > 0 ? result[0] : null;

        if (!updatedAppointment) {
            return JSON.stringify({ httpStatus: 500, message: 'Failed to retrieve updated appointment.' });
        }

        console.log('Updated appointment:', updatedAppointment);
        return JSON.stringify({ httpStatus: 200, message: `Appointment with ID ${appointmentId} updated successfully.`, appointment: updatedAppointment });
    } catch (error) {
        console.error('Error updating appointment by ID:', error);
        return JSON.stringify({ httpStatus: 500, message: 'Internal Server Error' });
    }
});


client.on("connect", () => {
    console.log("scheduling-service connected to broker")
});
