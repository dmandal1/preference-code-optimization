import express from 'express';
import { PreferenceController } from '../../controller/preference.controller';

export const preferenceRoutes: express.Router = express.Router();

const preferenceController = PreferenceController.createInstance();

/**
 * @swagger
 *
 * definitions:
 *   ApiResponse:
 *     type: object
 *     properties:
 *       status:
 *         type: boolean
 *       message:
 *         type: string
 *       result:
 *         type: object
 *         items:
 *           oneOf:
 *              - $ref: '#/definitions/Preference'
 *   CreatePreferenceRequest:
 *      type: object
 *      properties:
 *        userId:
 *          type: string
 *        inAppNotification:
 *          type: boolean
 *        emailNotification:
 *          type: boolean
 *        emailFrequency:
 *          type: number
 *   Preference:
 *     type: object
 *     properties:
 *       userId:
 *         type: string
 *       inAppNotification:
 *          type: boolean
 *       emailNotification:
 *          type: boolean
 *       emailFrequency:
 *          type: number
 */

/**
 * @swagger
 * /api/notification/preference/save:
 *   post:
 *     tags:
 *       - preference
 *     description: Saves preference of particular user
 *     produces:
 *       - application/json
 *     requestBody:
 *        description: "JSON Payload"
 *        required: true
 *        content:
 *          application/json:
 *            schema:
 *              $ref: "#/definitions/CreatePreferenceRequest"
 *     responses:
 *       200:
 *         description: Returns newly created preference object
 *       420:
 *         description: Method Failure
 */
preferenceRoutes.route('/save').post(preferenceController.savePreference);

/**
 * @swagger
 * /api/notification/preference/read/{userId}:
 *   get:
 *     tags:
 *       - preference
 *     description: Get preference of particular user
 *     produces:
 *       - application/json
 *     parameters:
 *      - in: "path"
 *        name: userId
 *        schema:
 *          type: string
 *        required: true
 *        description: email id of the user
 *     responses:
 *       200:
 *         description: Returns JSON of preference of that user
 *       420:
 *         description: Method Failure
 */
preferenceRoutes.route('/read/:userId').get(preferenceController.getPreference);
