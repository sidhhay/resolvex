const { registerUser, loginUser } = require("./auth.service");

const register = async (req, res) => {
    try {
        const { name, email, password } = req.body;

        const user = await registerUser(name, email, password);

        res.status(201).json({
            message: "User registered successfully",
            user: user
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            message: error.message
        });
    }
};

const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        console.log("login request:", email);

        const result = await loginUser(email, password);

        res.status(200).json({
            message: "Login successful",
            ...result
        });

    } catch (error) {
        console.error(error);

        res.status(401).json({
            message: error.message
        });
    }
};

module.exports = {
    login,
    register
};