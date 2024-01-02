import jwt from 'jsonwebtoken';
import db from '../../db.js';

export const deleteTimeslot = (payload) => {
    payload = JSON.parse(payload)
    const token = jwt.decode(payload.token)

    if (!token) {
        return JSON.stringify({ httpStatus: 401, message: 'Unauthorized' });
    }

    if (token.role !== 'dentist') {
        return JSON.stringify({ httpStatus: 403, message: 'Forbidden' });
    }

    try {
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
}

export const createTimeslot = (payload) => {
    payload = JSON.parse(payload);
    const token = jwt.decode(payload.token);

    if (!token) {
        return JSON.stringify({ httpStatus: 401, message: 'Unauthorized' });
    }

    if (token.role !== 'dentist') {
        return JSON.stringify({ httpStatus: 403, message: 'Forbidden' });
    }

    if (!payload.start_time || !payload.end_time) {
        return JSON.stringify({ httpStatus: 400, message: "Start time and end time for a timeslot must be specified" })
    }

    if (payload.end_time < payload.start_time) {
        return JSON.stringify({ httpStatus: 400, message: "End time must be later then start time" })
    }

    try {
        const timeslot = db.querySync(`SELECT * FROM public.timeslot where start_time = $1 and dentist_id = $2`, [payload.start_time, token.id])
        if (timeslot.length > 0) {
            return JSON.stringify({ httpStatus: 400, message: "You already have created a timeslot that starts at this time" })
        }
    } catch (e) {
        console.log(e)
        return JSON.stringify({ httpStatus: 500, message: "Some error occurred" })
    }

    try {
        const timeslot = db.querySync(`SELECT * FROM public.timeslot where end_time = $1 and dentist_id = $2`, [payload.end_time, token.id])
        if (timeslot.length > 0) {
            return JSON.stringify({ httpStatus: 400, message: "You already have created a timeslot that ends at this time" })
        }
    } catch (e) {
        console.log(e)

        return JSON.stringify({ httpStatus: 500, message: "Some error occurred" })
    }

    try {

        const overlappingTimeslots = db.querySync(
            `SELECT * FROM public.timeslot
             WHERE dentist_id = $1
             AND (
                (start_time < $3 AND end_time > $2) OR
                (start_time < $2 AND end_time > $3)
             )`,
            [token.id, payload.start_time, payload.end_time]
        );

        if (overlappingTimeslots.length > 0) {
            return JSON.stringify({ httpStatus: 400, message: "The new timeslot overlaps with existing ones" });
        }
    } catch (e) {
        console.log(e)

        return JSON.stringify({ httpStatus: 500, message: "Error occurred while checking overlapping timeslots" });
    }

    try {
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
        console.log(e)

        return JSON.stringify({
            httpStatus: 500,
            message: 'Some error occurred'
        });
    }
}