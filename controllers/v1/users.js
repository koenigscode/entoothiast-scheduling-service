import db from '../../db.js';

export const updateUser = (payload) => {
    payload = JSON.parse(payload);
    console.log('Received payload:', payload);

    const userId = parseInt(payload.userId);
    const requestBody = payload.requestBody;

    if (isNaN(userId)) {
        return JSON.stringify({ httpStatus: 400, message: 'Invalid payload. User ID is not a valid number.' });
    }

    try {
        const currentUser = db.querySync('SELECT * FROM public.user WHERE id = $1', [userId]);
        if (currentUser.length === 0) {
            return JSON.stringify({ httpStatus: 404, message: `User with ID ${userId} not found.` });
        }

        // Construct the update query based on the fields to be updated
        const updateFields = [];
        const updateValues = [];

        let paramCounter = 1;
        if (requestBody.username) {
            updateFields.push(`username = $${paramCounter++}`);
            updateValues.push(requestBody.username);
        }

        if (requestBody.name) {
            updateFields.push(`name = $${paramCounter++}`);
            updateValues.push(requestBody.name);
        }

        // Update only if there are fields to update
        if (updateFields.length > 0) {
            const updateQuery = `UPDATE public.user SET ${updateFields.join(', ')} WHERE id = $${paramCounter++} RETURNING *`;

            const result = db.querySync(
                updateQuery,
                [...updateValues, userId]
            );
            
            const updatedUser = result.length > 0 ? result[0] : null;

            if (!updatedUser) {
                return JSON.stringify({ httpStatus: 500, message: 'Failed to retrieve updated user.' });
            }

            console.log('User details updated for user:', updatedUser);
            console.log('Sending response...');
            return JSON.stringify({ httpStatus: 200, message: `User details for user with ID ${userId} updated successfully.`, user: updatedUser });
        } else {
            // No fields to update
            return JSON.stringify({ httpStatus: 400, message: 'No fields provided for update.' });
        }
    } catch (error) {
        console.error('Error updating user details by ID:', error);
        return JSON.stringify({ httpStatus: 500, message: 'Internal Server Error' });
    }
};

