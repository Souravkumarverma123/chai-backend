import mongoose, {isValidObjectId} from "mongoose"
import {Video} from "../models/video.model.js"
import {User} from "../models/user.model.js"
import {ApiError} from "../utils/ApiError.js"
import {ApiResponse} from "../utils/ApiResponse.js"
import {asyncHandler} from "../utils/asyncHandler.js"
import {uploadOnCloudinary} from "../utils/cloudinary.js"


const getAllVideos = asyncHandler(async (req, res) => {
    const { page = 1, limit = 10, query, sortBy, sortType, userId } = req.query
    
    const pipeline = []
    
    // Match published videos
    pipeline.push({
        $match: {
            isPublished: true
        }
    })
    
    // Pagination
    const options1 = {
        page: parseInt(page),
        limit: parseInt(limit)
    }
    
    // Match by userId if provided
    if (userId && isValidObjectId(userId)) {
        pipeline.push({
            $match: {
                owner: new mongoose.Types.ObjectId(userId)
            }
        })
    }
    
    // Text search if query provided
    if (query) {
        pipeline.push({
            $match: {
                $or: [
                    { title: { $regex: query, $options: "i" } },
                    { description: { $regex: query, $options: "i" } }
                ]
            }
        })
    }
    
    // Sort
    const sortStage = {}
    if (sortBy && sortType) {
        sortStage[sortBy] = sortType === "asc" ? 1 : -1
    } else {
        sortStage.createdAt = -1 // Default sort by newest
    }
    pipeline.push({ $sort: sortStage })
    
    // Lookup owner details
    pipeline.push({
        $lookup: {
            from: "users",
            localField: "owner",
            foreignField: "_id",
            as: "owner",
            pipeline: [
                {
                    $project: {
                        fullName: 1,
                        username: 1,
                        avatar: 1
                    }
                }
            ]
        }
    })
    
    pipeline.push({
        $addFields: {
            owner: {
                $first: "$owner"
            }
        }
    })
    
    const videoAggregate = Video.aggregate(pipeline)
    const options = {
        page: parseInt(page),
        limit: parseInt(limit)
    }
    
    const videos = await Video.aggregatePaginate(videoAggregate, options)
    
    return res
        .status(200)
        .json(new ApiResponse(200, videos, "Videos fetched successfully"))
})

const publishAVideo = asyncHandler(async (req, res) => {
    const { title, description } = req.body
    // check  that both title and description is provided
    if (!(title && description)) {
        throw new ApiError(400, "Title and description are required")
    }
    // set the local path for the video and thumbnail and then check that the local path is set sucessfully
    const videoFileLocalPath = req.files?.videoFile?.[0]?.path
    const thumbnailLocalPath = req.files?.thumbnail?.[0]?.path
    
    if (!videoFileLocalPath) {
        throw new ApiError(400, "Video file is required")
    }
    
    if (!thumbnailLocalPath) {
        throw new ApiError(400, "Thumbnail is required")
    }
    
    // Upload video to cloudinary
    const videoFile = await uploadOnCloudinary(videoFileLocalPath)
    if (!videoFile) {
        throw new ApiError(400, "Video file upload failed")
    }
    
    // Upload thumbnail to cloudinary
    const thumbnail = await uploadOnCloudinary(thumbnailLocalPath)
    if (!thumbnail) {
        throw new ApiError(400, "Thumbnail upload failed")
    }
    
    // Create video document
    const video = await Video.create({
        videoFile: videoFile.url,
        thumbnail: thumbnail.url,
        title,
        description,
        duration: videoFile.duration || 0,
        owner: req.user._id,
        isPublished: true
    })
    
    const createdVideo = await Video.findById(video._id)
    
    if (!createdVideo) {
        throw new ApiError(500, "Something went wrong while publishing the video")
    }
    
    return res
        .status(201)
        .json(new ApiResponse(201, createdVideo, "Video published successfully"))
})

const getVideoById = asyncHandler(async (req, res) => {
    const { videoId } = req.params
    
    if (!isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid video ID")
    }
    
    const video = await Video.findById(videoId)
    
    if (!video) {
        throw new ApiError(404, "Video not found")
    }
    
    // Increment view count
    await Video.findByIdAndUpdate(videoId, {
        $inc: { views: 1 }
    })
    
    // Get owner details
    const videoWithOwner = await Video.aggregate([
        {
            $match: {
                _id: new mongoose.Types.ObjectId(videoId)
            }
        },
        {
            $lookup: {
                from: "users",
                localField: "owner",
                foreignField: "_id",
                as: "owner",
                pipeline: [
                    {
                        $project: {
                            fullName: 1,
                            username: 1,
                            avatar: 1
                        }
                    }
                ]
            }
        },
        {
            $addFields: {
                owner: {
                    $first: "$owner"
                }
            }
        }
    ])
    
    return res
        .status(200)
        .json(new ApiResponse(200, videoWithOwner[0], "Video fetched successfully"))
})

const updateVideo = asyncHandler(async (req, res) => {
    const { videoId } = req.params
    const { title, description } = req.body
    
    if (!isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid video ID")
    }
    
    const video = await Video.findById(videoId)
    
    if (!video) {
        throw new ApiError(404, "Video not found")
    }
    
    // Check if user owns the video
    if (video.owner.toString() !== req.user._id.toString()) {
        throw new ApiError(403, "You can only update your own videos")
    }
    
    const updateFields = {}
    
    if (title) updateFields.title = title
    if (description) updateFields.description = description
    
    // Handle thumbnail update if provided
    if (req.file) {
        const thumbnailLocalPath = req.file.path
        const thumbnail = await uploadOnCloudinary(thumbnailLocalPath)
        
        if (!thumbnail) {
            throw new ApiError(400, "Thumbnail upload failed")
        }
        
        updateFields.thumbnail = thumbnail.url
    }
    
    const updatedVideo = await Video.findByIdAndUpdate(
        videoId,
        { $set: updateFields },
        { new: true }
    )
    
    return res
        .status(200)
        .json(new ApiResponse(200, updatedVideo, "Video updated successfully"))
})

const deleteVideo = asyncHandler(async (req, res) => {
    const { videoId } = req.params
    
    if (!isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid video ID")
    }
    
    const video = await Video.findById(videoId)
    
    if (!video) {
        throw new ApiError(404, "Video not found")
    }
    
    // Check if user owns the video
    if (video.owner.toString() !== req.user._id.toString()) {
        throw new ApiError(403, "You can only delete your own videos")
    }
    
    await Video.findByIdAndDelete(videoId)
    
    return res
        .status(200)
        .json(new ApiResponse(200, {}, "Video deleted successfully"))
})

const togglePublishStatus = asyncHandler(async (req, res) => {
    const { videoId } = req.params
    
    if (!isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid video ID")
    }
    
    const video = await Video.findById(videoId)
    
    if (!video) {
        throw new ApiError(404, "Video not found")
    }
    
    // Check if user owns the video
    if (video.owner.toString() !== req.user._id.toString()) {
        throw new ApiError(403, "You can only toggle publish status of your own videos")
    }
    
    const updatedVideo = await Video.findByIdAndUpdate(
        videoId,
        { $set: { isPublished: !video.isPublished } },
        { new: true }
    )
    
    return res
        .status(200)
        .json(new ApiResponse(200, updatedVideo, `Video ${updatedVideo.isPublished ? 'published' : 'unpublished'} successfully`))
})

export {
    getAllVideos,
    publishAVideo,
    getVideoById,
    updateVideo,
    deleteVideo,
    togglePublishStatus
}
