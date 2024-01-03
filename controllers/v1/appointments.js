import jwt from 'jsonwebtoken';
import db from '../../db.js';

export const createAppointment = (payload) => {
    payload = JSON.parse(payload);

    const token = jwt.decode(payload.token)

    if (!token) {
        return JSON.stringify({ httpStatus: 401, message: 'Unauthorized' });
    }

    if (token.role !== 'patient') {
        return JSON.stringify({ httpStatus: 403, message: 'Forbidden' });
    }

    if (!payload.body.patient_id || !payload.body.dentist_id || !payload.body.timeslot_id)
        return JSON.stringify({ httpStatus: 400, message: "Patient ID, Dentist ID, Timeslot ID do not exist" })

    try {
        const result = db.querySync(
            "INSERT INTO public.appointment (patient_id, dentist_id, timeslot_id, cancelled, confirmed) VALUES ($1, $2, $3, $4, $5) RETURNING *",
            [payload.body.patient_id, payload.body.dentist_id, payload.body.timeslot_id, payload.body.cancelled, payload.body.confirmed]
        );
        const appointment = result[0]
        return JSON.stringify({ httpStatus: 201, appointment, message: `Appointment created` });
    } catch (error) {
        console.error('Error processing appointment creation:', error);
        return JSON.stringify({ httpStatus: 500, message: "Cannot create appointment" });
    }
}

export const allAppointments = (payload) => {
    payload = JSON.parse(payload)
    const token = jwt.decode(payload.token)

    if (!token) {
        return JSON.stringify({ httpStatus: 401, message: 'Unauthorized' });
    }

    try {
        const appointments = db.querySync(`SELECT appointment.id AS appointment_id, appointment.*, timeslot.*, "user".name AS patient_name
        FROM appointment
        JOIN timeslot ON timeslot.id = appointment.timeslot_id
        JOIN "user" ON "user".id = appointment.patient_id
        WHERE appointment.dentist_id = $1`, [token.id])
        return JSON.stringify({ httpStatus: 200, appointments })
    } catch (e) {
        return JSON.stringify({ httpStatus: 500, message: `Some error occurred` })
    }
}

export const readAppointment = (payload) => {
    payload = JSON.parse(payload);

    const token = jwt.decode(payload.token)

    if (!token) {
        return JSON.stringify({ httpStatus: 401, message: 'Unauthorized' });
    }

    const appointmentId = parseInt(payload.appointmentId);

    if (isNaN(appointmentId)) {
        return JSON.stringify({ httpStatus: 400, message: 'Invalid payload. Appointment ID is not a valid number.' });
    }

    try {
        const result = db.querySync('SELECT * FROM public.appointment WHERE id = $1', [appointmentId]);
        console.log(result)
        if (!result) {
            return JSON.stringify({ httpStatus: 404, message: 'Appointment not found' });
        }
    } catch (e) {
        return JSON.stringify({ httpStatus: 500, message: "Some error occurred" })
    }


    try {
        const result = db.querySync('SELECT * FROM public.appointment WHERE id = $1 and (patient_id = $2 or dentist_id = $2)', [appointmentId, token.id]);
        if (result.length === 0) {
            return JSON.stringify({ httpStatus: 400, message: "Appointment with this id is not assigned to you" })
        }
        const appointment = result[0];
        return JSON.stringify({ httpStatus: 200, appointment });
    } catch (error) {
        console.error('Error retrieving appointment:', error);
        return JSON.stringify({ httpStatus: 500, message: 'Internal Server Error' });
    }
}

export const updateAppointment = (payload) => {
    payload = JSON.parse(payload);
    const token = jwt.decode(payload.token)

    const appointmentId = parseInt(payload.appointmentId);
    const requestBody = payload.requestBody;

    //check if appointment id is an integer
    if (isNaN(appointmentId)) {
        return JSON.stringify({ httpStatus: 400, message: 'Invalid payload. Appointment ID is not a valid number.' });
    }

    if (!token) {
        return JSON.stringify({ httpStatus: 401, message: 'Unauthorized' });
    }

    // Patients may only cancel the appointment
    if (token.role !== "dentist") {
        if (requestBody.confirmed !== undefined || requestBody.patient_id !== undefined || requestBody.dentistId !== undefined || requestBody.timeslot_id !== undefined) {
            return JSON.stringify({ httpStatus: 403, message: 'As a patient, you may only cancel an appointment, not change any other details.' });
        }
    }

    try {

        try {
            const appointemnt = db.querySync('SELECT * FROM public.appointment WHERE id = $1 and (patient_id = $2 or dentist_id = $2)', [appointmentId, token.id]);
            if (appointemnt.length === 0) {
                return JSON.stringify({ httpStatus: 400, message: "Appointment with this id is not assigned to you" })
            }
        } catch (e) {
            return JSON.stringify({ httpStatus: 500, message: "Some error occurred" })
        }
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
}