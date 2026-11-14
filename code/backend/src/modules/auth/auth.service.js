const prisma = require("../../database/prisma");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const registerUser = async (name, email, password) => {

    const existingUser = await prisma.user.findUnique({
        where: {
            email: email
        }
    });

    if (existingUser) {
        throw new Error("User already exists");
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
        data: {
            name: name,
            email: email,
            password_hash: passwordHash
        }
    });

    return user;
};


const loginUser = async (email, password) => {

    // 1. Find user
    const user = await prisma.user.findUnique({
        where: {
            email: email
        }
    });

    // 2. User doesn't exist
    if (!user) {
        throw new Error("Invalid email or password");
    }

    // 3. Compare password with stored hash
    const passwordMatch = await bcrypt.compare(
        password,
        user.password_hash
    );

    // 4. Password is incorrect
    if (!passwordMatch) {
        throw new Error("Invalid email or password");
    }

    // 5. Generate JWT
    const token = jwt.sign(
        {
            user_id: user.user_id,
            email: user.email,
            role: user.role
        },
        process.env.JWT_SECRET,
        {
            expiresIn: process.env.JWT_EXPIRES_IN
        }
    );

    // 6. Return token + safe user information
    return {
        token: token,
        user: {
            user_id: user.user_id,
            name: user.name,
            email: user.email,
            role: user.role
        }
    };
};


module.exports = {
    registerUser,
    loginUser
};