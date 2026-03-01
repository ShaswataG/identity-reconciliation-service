/**
 * @openapi
 * components:
 *   schemas:
 *     IdentifyContactResponse:
 *       type: object
 *       properties:
 *         contact:
 *           type: object
 *           properties:
 *             primaryContatctId:
 *               type: number
 *             emails:
 *               type: array
 *               items:
 *                 type: string
 *             phoneNumbers:
 *               type: array
 *               items:
 *                 type: string
 *             secondaryContactIds:
 *               type: array
 *               items:
 *                 type: number
 *       required:
 *         - contact
 */