
import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";


const app = express()
// we uses app.use when we have do a middleware or any configuration related settings

app.use(cors({
   origin: process.env.CORS_ORIGIN,
   credentials: true
}))

 app.use(express.json({limit: "20kb"}))
app.use(express.urlencoded({extended: true, limit: '20kb'}))
app.use(express.static("public"))
app.use(cookieParser())

// routes import 

import userRouter from "./routes/user.routes.js"


// routes declartion

app.use("/api/v1/users", userRouter)

// http://localhost:8000/api/v1/users/register

export { app }



















