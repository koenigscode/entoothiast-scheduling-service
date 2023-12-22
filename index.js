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
    if (isNaN(appointmentId)) {
        return JSON.stringify({ httpStatus: 400, message: 'Invalid payload. Appointment ID is not a valid number.' });
    }
    try {
        const currentAppointment = db.querySync('SELECT * FROM public.appointment WHERE id = $1', [appointmentId]);
        if (currentAppointment.length === 0) {
            return JSON.stringify({ httpStatus: 404, message: `Appointment with ID ${appointmentId} not found.` });
        }
        const result = db.querySync(
            'UPDATE public.appointment SET patient_id = $1, dentist_id = $2, timeslot_id = $3, cancelled = $4, confirmed = $5 WHERE id = $6 RETURNING *',
            [requestBody.patient_id, requestBody.dentist_id, requestBody.timeslot_id, requestBody.cancelled, requestBody.confirmed, appointmentId]
        );
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
