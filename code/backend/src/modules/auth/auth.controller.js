const login=async (req,res)=>{
    try{
        const {email,password}=req.body;
        console.log("login request:",email);
        res.json({
            message:"Login controller reached",
            email:email
        });
    }
    catch(error){
        console.log(error);
        res.status(500).json({
            message:"oopsy something went wrong"
        });
    }
}
module.exports={
    login
}