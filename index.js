import * as mqtt from "mqtt"
import MqttRequest from "mqtt-request"
import PGClient from "pg-native"
import jwt from "jsonwebtoken"

const db = new PGClient()
db.connectSync(process.env.CONNECTION_STRING)



const client = mqtt.connect(process.env.BROKER_URL)

MqttRequest.timeout = 5000;

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
        const token = jwt.decode(payload.token)
        const result = db.querySync(
            'DELETE FROM public.timeslot WHERE id = $1 AND dentist_id = $2 RETURNING *', [payload.timeslotId, token.id]
        );

        if (result && result.length > 0) {
            return JSON.stringify({ httpStatus: 200, timeslot: result });
        } else {
            return JSON.stringify({ httpStatus: 404, message: 'Timeslot ID not found' });
        }
    } catch (e) {
        return JSON.stringify({ httpStatus: 500, message: `Some error occurred` });
    }
});

mqttReq.response("v1/timeslots/create", (payload) => {
    payload = JSON.parse(payload);

    try {
        const token = jwt.decode(payload.token)
        db.querySync("INSERT INTO public.timeslot (dentist_id, start_time, end_time) VALUES ($1, $2, $3)", [token.id, payload.start_time, payload.end_time]);

        const insertedTimeslot = db.querySync("SELECT * FROM public.timeslot WHERE dentist_id = $1 AND start_time = $2 AND end_time = $3", [token.id, payload.start_time, payload.end_time]);

        if (insertedTimeslot && insertedTimeslot.length > 0) {
            return JSON.stringify({
                httpStatus: 201,
                message: `Created a new timeslot from ${payload.start_time} to ${payload.end_time}`,
                timeslot: insertedTimeslot[0] 
            });
        }
    } catch (e) {
        return JSON.stringify({
            httpStatus: 500,
            message: 'Some error occurred'
        });
    }
});


mqttReq.response("v1/dentists/ratings/create", (payload) => {
    payload = JSON.parse(payload)
    try {
        console.log(typeof payload.rating)
        console.log(typeof payload.favorite_dentist)
        if (typeof payload.rating != "number" && payload.rating != undefined){
            return JSON.stringify({ httpStatus: 400, message: "Rating has to be a number"})
        }
        
        if (typeof payload.favorite_dentist != "boolean" && payload.favorite_dentist != undefined){
            return JSON.stringify({ httpStatus: 400, message: "Favorite_dentist field has to have a boolean value"})
        }
        if (payload.rating < 1 || payload.rating > 5){
            return JSON.stringify({ httpStatus: 400, message: "Rating has to be a number between 1 and 5"})
        }
        //if there is not dentist with the payload.dentistId -> insert new dentist and new rating
        //don't forget to also send the patient_id -> this table has a compound key of patient_id and dentist_id
        const token = jwt.decode(payload.token)
        const role = db.querySync(`SELECT role FROM public.user WHERE id = $1`, [payload.dentistId]);
        if (role.length === 0 || role[0].role !== 'dentist') {
            return JSON.stringify({ httpStatus: 400, message: "You can't post a rating for a patient or add a patient to your favorites" });
        }
        const dentist_on_user = db.querySync(`SELECT * FROM public.patient_on_dentist WHERE dentist_id = $1 and patient_id = $2`, [payload.dentistId, token.id]);
        if (dentist_on_user.length === 0){
            if (payload.rating != undefined && payload.favorite_dentist != undefined){
                const rating = parseInt(payload.rating)
                db.querySync("insert into public.patient_on_dentist (patient_id, dentist_id, rating, favorite_dentist) values ($1, $2, $3, $4)", [token.id, payload.dentistId, rating, payload.favorite_dentist])
            } else if (payload.rating != undefined){
                const rating = parseInt(payload.rating)
                db.querySync("insert into public.patient_on_dentist (patient_id, dentist_id, rating) values ($1, $2, $3)", [token.id, payload.dentistId, rating])
            } else if (payload.favorite_dentist != undefined){
                db.querySync("insert into public.patient_on_dentist (patient_id, dentist_id, favorite_dentist) values ($1, $2, $3)", [token.id, payload.dentistId, payload.favorite_dentist])
            }
        }
        //if there is a dentist in the dentist_on_patient table, just insert a new rating.
        else{
            if (payload.rating != undefined && payload.favorite_dentist != undefined){
                db.querySync(`UPDATE public.patient_on_dentist SET rating = $1, favorite_dentist = $2 where dentist_id = $3`, [payload.rating, payload.favorite_dentist, payload.dentistId])
            }
            else if (payload.rating != undefined){
                db.querySync(`UPDATE public.patient_on_dentist SET rating = $1 where dentist_id = $2`, [payload.rating, payload.dentistId])
            } else if (payload.favorite_dentist != undefined){
                db.querySync(`UPDATE public.patient_on_dentist SET favorite_dentist = $1 where dentist_id = $2`, [payload.favorite_dentist, payload.dentistId])
            }
             
        }
        const dentist = db.querySync(`select * from public.patient_on_dentist where patient_id = $1 and dentist_id = $2`, [token.id, payload.dentistId])
        return JSON.stringify({ httpStatus: 201, dentist})
    } catch (e) {
        console.log(e)
        return JSON.stringify({ httpStatus: 500, message: `Some error occurred`, errorInternal: e })
    }
});


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
