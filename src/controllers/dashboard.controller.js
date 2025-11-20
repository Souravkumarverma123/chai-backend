import mongoose from "mongoose"
import {Video} from "../models/video.model.js"
import {Subscription} from "../models/subscription.model.js"
import {Like} from "../models/like.model.js"
import {Comment} from "../models/comment.model.js"
import {ApiError} from "../utils/ApiError.js"
import {ApiResponse} from "../utils/ApiResponse.js"
import {asyncHandler} from "../utils/asyncHandler.js"

const getChannelStats = asyncHandler(async (req, res) => {
    const userId = req.user._id
    
    const totalVideos = await Video.countDocuments({ owner: userId })
    const totalViews = await Video.aggregate([
        { $match: { owner: new mongoose.Types.ObjectId(userId) } },
        { $group: { _id: null, totalViews: { $sum: "$views" } } }
    ])
    
    const totalSubscribers = await Subscription.countDocuments({ channel: userId })
    const totalLikes = await Like.countDocuments({ 
        video: { $in: await Video.find({ owner: userId }).distinct('_id') }
    })
    
    const totalComments = await Comment.countDocuments({
        video: { $in: await Video.find({ owner: userId }).distinct('_id') }
    })
    
    const stats = {
        totalVideos,
        totalViews: totalViews[0]?.totalViews || 0,
        totalSubscribers,
        totalLikes,
        totalComments
    }
    
    return res
        .status(200)
        .json(new ApiResponse(200, stats, "Channel stats fetched successfully"))
})

const getChannelVideos = asyncHandler(async (req, res) => {
    const userId = req.user._id
    const { page = 1, limit = 10, status = "all" } = req.query
    
    const matchStage = { owner: new mongoose.Types.ObjectId(userId) }
    
    if (status === "published") {
        matchStage.isPublished = true
    } else if (status === "draft") {
        matchStage.isPublished = false
    }
    
    const options = {
        page: parseInt(page),
        limit: parseInt(limit)
    }
    
    const videos = await Video.aggregatePaginate(
        Video.aggregate([
            { $match: matchStage },
            {
                $lookup: {
                    from: "likes",
                    localField: "_id",
                    foreignField: "video",
                    as: "likes"
                }
            },
            {
                $lookup: {
                    from: "comments",
                    localField: "_id",
                    foreignField: "video",
                    as: "comments"
                }
            },
            {
                $addFields: {
                    likeCount: { $size: "$likes" },
                    commentCount: { $size: "$comments" }
                }
            },
            {
                $project: {
                    likes: 0,
                    comments: 0
                }
            },
            {
                $sort: {
                    createdAt: -1
                }
            }
        ]),
        options
    )
    
    return res
        .status(200)
        .json(new ApiResponse(200, videos, "Channel videos fetched successfully"))
})

export {
    getChannelStats,
    getChannelVideos
}
    