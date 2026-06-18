import jwt from "jsonwebtoken";


export const createToken = (payload) => {
    const JWT_SECRET = process.env.JWT_KEY;
    return jwt.sign(payload, JWT_SECRET, {
        expiresIn: "3d",
    });
}