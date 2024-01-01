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
        db.querySync("select from public.timeslot where start_time = $1", [payload.startTime || Date.now()])
        return JSON.stringify({ httpStatus: 201, message: `${payload}` })
    } catch (e) {
        return JSON.stringify({ httpStatus: 400, message: "Timeslots with this start time not found."})
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


mqttReq.response("v1/clinics/create", (payload) => {
    payload = JSON.parse(payload);

        if (!payload.name|| !payload.longitude || !payload.latitude)
        return JSON.stringify({ httpStatus: 400, message: "Name of the clinic, its longitude and latitude must be specified" })

    try {
        const result = db.querySync(
            "INSERT INTO public.clinic (name, latitude, longitude) VALUES ($1, $2, $3) RETURNING *",
            [payload.name, payload.latitude, payload.longitude]
        );
        const clinic = result[0]
        return JSON.stringify({ httpStatus: 201, clinic, message: `New clinic created` });
    } catch (error) {
        return JSON.stringify({ httpStatus: 500, message: "Some error occurred", error:error });
    }
});

mqttReq.response("v1/clinics/update", (payload) => {
    payload = JSON.parse(payload);
    const clinicId = parseInt(payload.clinicId);
    const requestBody = payload.requestBody;

    if (isNaN(clinicId)) {
        return JSON.stringify({ httpStatus: 400, message: 'Clinic ID is not a valid number.' });
    }

    try {
        const clinic = db.querySync('SELECT * FROM public.clinic WHERE id = $1', [clinicId]);

        if (clinic.length === 0) {
            return JSON.stringify({ httpStatus: 404, message: `Clinic with ID ${clinicId} not found.` });
        }

        const updateFields = [];
        const updateValues = [];

        if (requestBody.name !== undefined) {
            updateFields.push(`name = $1`);
            updateValues.push(requestBody.name);
        }

        if (requestBody.latitude !== undefined) {
            updateFields.push(`latitude = $2`);
            updateValues.push(requestBody.latitude);
        }

        if (requestBody.longitude !== undefined) {
            updateFields.push(`longitude = $3`);
            updateValues.push(requestBody.longitude);
        }

        if (updateFields.length === 0) {
            return JSON.stringify({ httpStatus: 400, message: 'No fields provided for update.' });
        }

        const updateQuery = `UPDATE public.clinic SET ${updateFields.join(', ')} WHERE id = $${updateValues.length + 1} RETURNING *`;

        const result = db.querySync(updateQuery, [...updateValues, clinicId]);
        const updatedClinic = result.length > 0 ? result[0] : null;

        if (!updatedClinic) {
            return JSON.stringify({ httpStatus: 500, message: 'Failed to retrieve updated clinic.' });
        }

        return JSON.stringify({ httpStatus: 200, message: `Clinic with ID ${clinicId} updated successfully.`, clinic: updatedClinic });
    } catch (error) {
        console.log(error)
        return JSON.stringify({ httpStatus: 500, message: 'Some error occurred' });
    }
});


mqttReq.response("v1/clinics/delete", (payload) => {
    payload = JSON.parse(payload);

    const clinicId = parseInt(payload.clinicId);
    if (isNaN(clinicId)) {
        return JSON.stringify({ httpStatus: 400, message: 'Clinic ID is not a valid number.' });
    }
    try {
        const result = db.querySync('DELETE FROM public.clinic WHERE id = $1 RETURNING *', [clinicId]);
        if (result.length === 0) {
            return JSON.stringify({ httpStatus: 404, message: 'Clinic with this id is not found' });
        }
        const clinic = result[0];
        return JSON.stringify({ httpStatus: 200, clinic });
    } catch (error) {
        return JSON.stringify({ httpStatus: 500, message: 'Some error occurred' });
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
