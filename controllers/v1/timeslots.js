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
        const appointmentCheck = db.querySync(
            'SELECT id FROM public.appointment WHERE timeslot_id = $1 LIMIT 1', [payload.timeslotId]
        );

        if (appointmentCheck && appointmentCheck.length > 0) {
            return JSON.stringify({
                httpStatus: 400,
                message: "You can't delete a timeslot during which a patient has booked an appointment. If this time doesn't work for you anymore, consider cancelling an appointment.",
            });
        }

        const result = db.querySync(
            'DELETE FROM public.timeslot WHERE id = $1 AND dentist_id = $2 RETURNING *', [payload.timeslotId, token.id]
        );

        if (result && result.length > 0) {
            return JSON.stringify({ httpStatus: 200, timeslot: result });
        } else {
            return JSON.stringify({ httpStatus: 404, message: 'Timeslot ID not found' });
        }
    } catch (e) {
        console.log(e);
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

export const readTimeslots = (payload) => {
    let dentist;
    let clinic;
    let timeslots;


    payload = JSON.parse(payload);

    if (payload.clinic) {
        try {
            clinic = db.querySync(`SELECT * FROM public.clinic WHERE name = $1`, [payload.clinic])
            if (clinic.length === 0) {
                return JSON.stringify({ httpStatus: 404, message: "Clinic with this name doesn't exist" })
            }
            clinic = clinic[0]
            console.log(clinic)
        } catch (error) {
            return JSON.stringify({ httpStatus: 500, message: "Some error occurred when fetching the clinic" })
        }
    }

    if (payload.dentist) {
        try {
            dentist = db.querySync(`SELECT * FROM public."user" WHERE name = $1`, [payload.dentist])
            if (dentist.length === 0) {
                return JSON.stringify({ httpStatus: 404, message: "Dentist with this name doesn't exist" })
            }
            dentist = dentist[0]
            console.log(dentist)
            if (dentist.role === 'patient') {
                return JSON.stringify({ httpStatus: 400, message: "A user with this name is a patient, not a dentist" })
            }
        } catch (error) {
            return JSON.stringify({ httpStatus: 500, message: "Some error occurred when fetching the dentist" })
        }
    }

    if (payload.clinic && payload.dentist) {
        try {
            console.log(dentist.id)
            console.log(clinic.id)
            timeslots = db.querySync(
                `SELECT public.timeslot.*,
                 public."user".name, public."user".username, public."user".id, public."user".clinic_id
                 FROM public.timeslot
                 left join public."appointment" on public.timeslot.id = public."appointment".timeslot_id
                 INNER JOIN public."user"  ON public.timeslot.dentist_id = public."user".id 
                 INNER JOIN public.clinic  ON public."user".clinic_id = public.clinic.id 
                 WHERE public.timeslot.start_time >= $1 
                 and "appointment".timeslot_id is null or "appointment"."cancelled" = true
                 AND public."user".id = $2 
                 AND public.clinic.id = $3`,
                [
                    payload.startTime || (new Date()).toISOString(),
                    dentist.id,
                    clinic.id
                ]
            );
            return JSON.stringify({ httpStatus: 200, timeslots });
        } catch (error) {
            return JSON.stringify({ httpStatus: 500, error: error.message });
        }
    }
    else if (payload.clinic) {
        try {
            timeslots = db.querySync(
                `SELECT public.timeslot.id as timeslot_id, public.timeslot.start_time, public.timeslot.end_time,
                   public."user".name, public."user".username, public."user".id, public."user".clinic_id
                     FROM public.timeslot
                     left join public."appointment" on public.timeslot.id = public."appointment".timeslot_id
                     INNER JOIN public."user"  ON public.timeslot.dentist_id = public."user".id 
                     INNER JOIN public.clinic  ON public."user".clinic_id = public.clinic.id 
                     where "appointment".timeslot_id is null or "appointment"."cancelled" = true
                     and public.timeslot.start_time >= $1 
                     AND public.clinic.id = $2`,
                [
                    payload.startTime || (new Date()).toISOString(),
                    clinic.id
                ]
            );

            return JSON.stringify({ httpStatus: 200, timeslots });
        } catch (error) {
            return JSON.stringify({ httpStatus: 500, error: error.message });
        }
    }

    else if (payload.dentist) {
        try {
            timeslots = db.querySync(
                `SELECT public.timeslot.*,
                   public."user".name, public."user".username, public."user".id, public."user".clinic_id
                     FROM public.timeslot
                     left join public."appointment" on public.timeslot.id = public."appointment".timeslot_id
                     INNER JOIN public."user"  ON public.timeslot.dentist_id = public."user".id 
                     WHERE public.timeslot.start_time >= $1 
                     and "appointment".timeslot_id is null or "appointment"."cancelled" = true
                     AND public."user".id = $2`,
                [
                    payload.startTime || (new Date()).toISOString(),
                    dentist.id
                ]
            );

            return JSON.stringify({ httpStatus: 200, timeslots });
        } catch (error) {
            return JSON.stringify({ httpStatus: 500, error: error.message });
        }

    }

    try {
        const timeslots = db.querySync(
            `SELECT public.timeslot.*,
               public."user".name, public."user".username, public."user".id, public."user".clinic_id
                FROM public.timeslot
                left join public."appointment" on public.timeslot.id = public."appointment".timeslot_id
                INNER JOIN public."user" ON public.timeslot.dentist_id = public."user".id
                WHERE start_time >= $1
                "appointment".timeslot_id is null or "appointment"."cancelled" = true`, [payload.startTime || (new Date()).toISOString()])
        return JSON.stringify({ httpStatus: 201, timeslots })
    } catch (e) {
        console.log(e)
        return JSON.stringify({ httpStatus: 500, message: "Internal Server Error" })
    }
}