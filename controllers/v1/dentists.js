import jwt from 'jsonwebtoken';
import db from '../../db.js';

export const readDentists = (payload) => {
    payload = JSON.parse(payload)

    try {
        const dentists = db.querySync("SELECT id, name, clinic_id FROM public.user WHERE role = 'dentist'")
        return JSON.stringify({ httpStatus: 200, dentists })
    } catch (e) {
        return JSON.stringify({ httpStatus: 500, message: `Some error occurred` })
    }
}

export const getTimeslots = (payload) => {
    payload = JSON.parse(payload);
    const token = jwt.decode(payload.token);
    if (!token) {
        return JSON.stringify({ httpStatus: 401, message: 'Unauthorized' });
    }
    try {
        const dentist = db.querySync('SELECT * FROM public."user" WHERE id = $1', [payload.dentistId])
        if (dentist.length === 0){
            return JSON.stringify({ httpStatus: 404, message: "Dentist with this id does not exist"})
        }
    } catch (error) {
        console.error("Error when finding the dentist with this id")
        return JSON.stringify({ httpStatus: 500, message: "Some error occurred"})
    }
    try {
        const timeslots = db.querySync('SELECT * FROM public.timeslot WHERE dentist_id = $1', [payload.dentistId]);

        if (timeslots && timeslots.length > 0) {
            return JSON.stringify({ httpStatus: 200, timeslots });
        } else if (timeslots.length === 0){
            return JSON.stringify({ httpStatus: 200, message: 'No timeslots found for the dentist' });
        } 
    } catch (error) {
        console.error('Error fetching dentist timeslots:', error);
        return JSON.stringify({ httpStatus: 500, message: 'Internal Server Error' });
    }
}

export const rateDentist = (payload) => {
    payload = JSON.parse(payload)

    const token = jwt.decode(payload.token)

    if (!token) {
        return JSON.stringify({ httpStatus: 401, message: 'Unauthorized' });
    }

    try {
        console.log(typeof payload.rating)
        console.log(typeof payload.favorite_dentist)
        if (typeof payload.rating != "number" && payload.rating != undefined) {
            return JSON.stringify({ httpStatus: 400, message: "Rating has to be a number" })
        }

        if (typeof payload.favorite_dentist != "boolean" && payload.favorite_dentist != undefined) {
            return JSON.stringify({ httpStatus: 400, message: "Favorite_dentist field has to have a boolean value" })
        }
        if (payload.rating < 1 || payload.rating > 5) {
            return JSON.stringify({ httpStatus: 400, message: "Rating has to be a number between 1 and 5" })
        }
        //if there is not dentist with the payload.dentistId -> insert new dentist and new rating
        //don't forget to also send the patient_id -> this table has a compound key of patient_id and dentist_id
        const role = db.querySync(`SELECT role FROM public.user WHERE id = $1`, [payload.dentistId]);
        if (role.length === 0 || role[0].role !== 'dentist') {
            return JSON.stringify({ httpStatus: 400, message: "You can't post a rating for a patient or add a patient to your favorites" });
        }
        const dentist_on_user = db.querySync(`SELECT * FROM public.patient_on_dentist WHERE dentist_id = $1 and patient_id = $2`, [payload.dentistId, token.id]);
        if (dentist_on_user.length === 0) {
            if (payload.rating != undefined && payload.favorite_dentist != undefined) {
                const rating = parseInt(payload.rating)
                db.querySync("insert into public.patient_on_dentist (patient_id, dentist_id, rating, favorite_dentist) values ($1, $2, $3, $4)", [token.id, payload.dentistId, rating, payload.favorite_dentist])
            } else if (payload.rating != undefined) {
                const rating = parseInt(payload.rating)
                db.querySync("insert into public.patient_on_dentist (patient_id, dentist_id, rating) values ($1, $2, $3)", [token.id, payload.dentistId, rating])
            } else if (payload.favorite_dentist != undefined) {
                db.querySync("insert into public.patient_on_dentist (patient_id, dentist_id, favorite_dentist) values ($1, $2, $3)", [token.id, payload.dentistId, payload.favorite_dentist])
            }
        }
        //if there is a dentist in the dentist_on_patient table, just insert a new rating.
        else {
            if (payload.rating != undefined && payload.favorite_dentist != undefined) {
                db.querySync(`UPDATE public.patient_on_dentist SET rating = $1, favorite_dentist = $2 where dentist_id = $3`, [payload.rating, payload.favorite_dentist, payload.dentistId])
            }
            else if (payload.rating != undefined) {
                db.querySync(`UPDATE public.patient_on_dentist SET rating = $1 where dentist_id = $2`, [payload.rating, payload.dentistId])
            } else if (payload.favorite_dentist != undefined) {
                db.querySync(`UPDATE public.patient_on_dentist SET favorite_dentist = $1 where dentist_id = $2`, [payload.favorite_dentist, payload.dentistId])
            }

        }
        const dentist = db.querySync(`select * from public.patient_on_dentist where patient_id = $1 and dentist_id = $2`, [token.id, payload.dentistId])
        return JSON.stringify({ httpStatus: 201, dentist })
    } catch (e) {
        console.log(e)
        return JSON.stringify({ httpStatus: 500, message: `Some error occurred`, errorInternal: e })
    }
}