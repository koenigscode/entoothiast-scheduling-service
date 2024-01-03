import jwt from "jsonwebtoken"
import db from "../../db.js"

export const readClinics = (payload) => {
    payload = JSON.parse(payload)

    try {
        const clinics = db.querySync('SELECT * FROM public.clinic')
        return JSON.stringify({ httpStatus: 200, clinics })
    } catch (e) {
        return JSON.stringify({ httpStatus: 400, message: "No clinics found" })
    }
}

export const createClinic = (payload) => {
    payload = JSON.parse(payload);
    const token = jwt.decode(payload.token)

    if (!token) {
        return JSON.stringify({ httpStatus: 401, message: 'Unauthorized' });
    }

    if (token.role !== 'admin') {
        return JSON.stringify({ httpStatus: 403, message: 'Forbidden' });
    }

    if (!payload.name || !payload.longitude || !payload.latitude)
        return JSON.stringify({ httpStatus: 400, message: "Name of the clinic, its longitude and latitude must be specified" })

    try {
        const result = db.querySync(
            "INSERT INTO public.clinic (name, latitude, longitude) VALUES ($1, $2, $3) RETURNING *",
            [payload.name, payload.latitude, payload.longitude]
        );
        const clinic = result[0]
        return JSON.stringify({ httpStatus: 201, clinic, message: `New clinic created` });
    } catch (error) {
        return JSON.stringify({ httpStatus: 500, message: "Some error occurred", error: error });
    }
}

export const updateClinic = (payload) => {
    payload = JSON.parse(payload);
    const token = jwt.decode(payload.token)

    if (!token) {
        return JSON.stringify({ httpStatus: 401, message: 'Unauthorized' });
    }

    if (token.role !== 'admin') {
        return JSON.stringify({ httpStatus: 403, message: 'Forbidden' });
    }

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
}

export const deleteClinic = (payload) => {
    payload = JSON.parse(payload);
    const token = jwt.decode(payload.token)

    if (!token) {
        return JSON.stringify({ httpStatus: 401, message: 'Unauthorized' });
    }

    if (token.role !== 'admin') {
        return JSON.stringify({ httpStatus: 403, message: 'Forbidden' });
    }

    if (isNaN(payload.clinicId)) {
        return JSON.stringify({ httpStatus: 400, message: 'Clinic ID is not a valid number.' });
    }
    try {
        db.querySync('UPDATE public."user" SET clinic_id = NULL WHERE role = $1 AND clinic_id = $2', ['dentist', payload.clinicId])
        const result = db.querySync('DELETE FROM public.clinic WHERE id = $1 RETURNING *', [payload.clinicId]);
        if (result.length === 0) {
            return JSON.stringify({ httpStatus: 404, message: 'Clinic with this id is not found' });
        }
        const clinic = result[0];
        return JSON.stringify({ httpStatus: 200, clinic });
    } catch (error) {
        return JSON.stringify({ httpStatus: 500, message: 'Some error occurred' });
    }
}
