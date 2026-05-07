/*
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * Misslite CF Worker — minimal Misskey-compatible backend
 * running on Cloudflare Workers with D1 as the database.
 */

import type { Env, Handler } from './types.js';
import { cors, json, err } from './helpers.js';
import { ensureSchema } from './schema.js';
import { meta, adminAccountsCreate, signin, signinFlow, signout, signup, changePassword } from './handlers/auth.js';
import {
	currentUser, updateUser, showUser, searchUsers,
	userRelation, userStats, usersSearchByUsernameAndHost,
	userAchievements, userFeaturedNotes, usersRecommendation,
	usersReportAbuse, usersUpdateMemo, usersGetSecurityInfo,
	listUsers, usersReactions, usersGetFrequentlyRepliedUsers,
	usersGetFollowingBirthdayUsers,
	usersGetSkebStatus,
} from './handlers/users.js';
import {
	createNote, showNote, showPartialBulk, deleteNote, timeline, userNotes, searchNotes,
	noteState, noteMentions, noteConversation,
	createReaction, deleteReaction, listReactions,
	createFavorite, deleteFavorite, listFavorites,
	notesChildren, notesReplies, notesRenotes, deleteRenote, searchByTag,
	threadMuteCreate, threadMuteDelete,
	notesList, notesScheduledList, notesScheduledCancel, notesTranslate,
} from './handlers/notes.js';
import {
	suspendUser, unsuspendUser, addModerator, removeModerator, showUsers,
	createInvite, listInvites,
	deleteAccount, resetPassword, updateMeta, showModerationLogs,
	listAnnouncements, createAnnouncement, deleteAnnouncement,
	adminAnnouncementsList, adminAnnouncementsUpdate,
	adminShowUser,
	adminGetIndexStats, adminGetTableStats,
	adminInviteCreate, adminInviteList,
	adminRegenerateUserToken,
	adminAbuseUserReports, adminResolveAbuseUserReport,
	adminForwardAbuseUserReport, adminUpdateAbuseUserReport,
	adminShowUserAccountMoveLogs,
	adminUnsetUserAvatar, adminUnsetUserBanner,
	adminUpdateUserName, adminUpdateUserNote,
} from './handlers/admin.js';
import {
	emojis, stats, ping, serverInfo, listNotifications, markNotificationsRead,
	readAnnouncement, swRegister, swUnregister,
	bubbleGameRanking, iClaimAchievement,
	swShowRegistration, swUpdateRegistration,
	usernameAvailable, emailAddressAvailable, getOnlineUsersCount,
	emojiSingle, endpointSingle, announcementShow,
	iPin, iUnpin, iDeleteAccount, iRegenerateToken,
	iRegistryGetDetail, iRegistryKeysWithType, iRegistryScopesWithDomain,
	testEndpoint,
	notificationsCreate, notificationsFlush,
	inviteDelete, inviteLimit,
	bubbleGameRegister,
	iRevokeToken,
	testListStub, testPostStub, testListMalfunction, testPostMalfunction,
	iNotificationsGrouped, iSigninHistory, iPurgeTimelineCache, iMove,
	notesFeatured, notesPollsVote, notesPollsRecommendation,
	fetchRss, fetchExternalResources, getAvatarDecorations,
	pinnedUsers, retention,
	pagesFeatured, promoRead, pagePush,
	requestResetPassword, resetPasswordHandler, resetDb,
	apGet, apShow,
	notificationsTestNotification,
	exportCustomEmojis,
	iExportAntennas, iExportBlocking, iExportClips, iExportFavorites,
	iExportFollowing, iExportMute, iExportNotes, iExportUserLists,
	iImportAntennas, iImportBlocking, iImportFollowing, iImportMuting, iImportUserLists,
} from './handlers/misc.js';
import { registryGetAll, registryGet, registrySet, registryRemove, registryKeys } from './handlers/registry.js';
import {
	followCreate, followDelete, followInvalidate,
	followRequestsAccept, followRequestsCancel, followRequestsList,
	followRequestsReject, followRequestsSent,
	followUpdate, followUpdateAll,
	usersFollowers, usersFollowing,
} from './handlers/following.js';
import { blockingCreate, blockingDelete, blockingList } from './handlers/blocking.js';
import {
	muteCreate, muteDelete, muteList,
	renoteMuteCreate, renoteMuteDelete, renoteMuteList,
} from './handlers/muting.js';
import {
	clipsCreate, clipsDelete, clipsShow, clipsUpdate, clipsList,
	clipsAddNote, clipsRemoveNote, clipsNotes,
	clipsFavorite, clipsUnfavorite, clipsMyFavorites,
	iClips as iClipsFromClips, usersClips, notesClips,
} from './handlers/clips.js';
import {
	channelsCreate, channelsShow, channelsUpdate,
	channelsFollow, channelsUnfollow,
	channelsFollowed as channelsFollowedFromChannels,
	channelsFeatured as channelsFeaturedFromChannels,
	channelsFavorite, channelsUnfavorite, channelsMyFavorites,
	channelsOwned, channelsSearch, channelsTimeline,
	channelsFeaturedGames,
} from './handlers/channels.js';
import {
	antennasCreate, antennasDelete, antennasShow, antennasUpdate,
	antennasList as antennasListFromAntennas, antennasNotes,
} from './handlers/antennas.js';
import {
	pagesCreate, pagesDelete, pagesShow, pagesUpdate,
	pagesLike, pagesUnlike, iPages, iPageLikes, usersPages,
} from './handlers/pages.js';
import {
	flashCreate, flashDelete, flashShow, flashUpdate,
	flashLike, flashUnlike, flashMy, flashMyLikes,
	flashFeatured as flashFeaturedFromFlash, usersFlashs,
} from './handlers/flash.js';
import {
	galleryPosts, galleryPostsCreate, galleryPostsDelete,
	galleryPostsShow, galleryPostsUpdate,
	galleryPostsLike, galleryPostsUnlike,
	galleryPopular,
	galleryFeatured as galleryFeaturedFromGallery,
	iGalleryPosts,
	iGalleryLikes as iGalleryLikesFromGallery,
	usersGalleryPosts,
} from './handlers/gallery.js';
import {
	rolesList, rolesShow, rolesNotes, rolesUsers,
	adminRolesCreate, adminRolesDelete, adminRolesList, adminRolesShow,
	adminRolesUpdate, adminRolesAssign, adminRolesUnassign, adminRolesUsers,
	adminRolesUpdateDefaultPolicies, adminRolesUpdateInlinePolicies,
} from './handlers/roles.js';
import {
	userListsCreate, userListsDelete, userListsShow, userListsUpdate,
	userListsList as userListsListFromUL, userListsPush, userListsPull,
	userListsGetMemberships, userListsCreateFromPublic,
	userListsFavorite, userListsUnfavorite, userListsUpdateMembership,
	iUserListMemberships as iUserListMembershipsFromUL,
	notesUserListTimeline,
} from './handlers/user-lists.js';
import {
	hashtagsTrend, hashtagsList, hashtagsSearch, hashtagsShow, hashtagsUsers,
} from './handlers/hashtags.js';
import {
	driveRoot, driveFiles, driveFilesAttachedNotes, driveFilesCheckExistence,
	driveFilesCreate, driveFilesDelete, driveFilesFind, driveFilesFindByHash,
	driveFilesShow, driveFilesUpdate, driveFilesUploadFromUrl,
	driveFolders, driveFoldersCreate, driveFoldersDelete, driveFoldersFind,
	driveFoldersShow, driveFoldersUpdate, driveStream,
} from './handlers/drive.js';
import {
	chartsActiveUsers, chartsApRequest, chartsDrive, chartsFederation,
	chartsInstance, chartsNotes, chartsUserDrive, chartsUserFollowing,
	chartsUserNotes, chartsUserPv, chartsUserReactions, chartsUsers,
} from './handlers/charts.js';
import {
	federationFollowers, federationFollowing, federationInstances,
	federationShowInstance, federationStats, federationUpdateRemoteUser, federationUsers,
} from './handlers/federation.js';
import {
	reversiCancelMatch, reversiGames, reversiInvitations, reversiMatch,
	reversiShowGame, reversiSurrender, reversiVerify,
} from './handlers/reversi.js';
import {
	adminAbuseReportResolverCreate, adminAbuseReportResolverDelete,
	adminAbuseReportResolverList, adminAbuseReportResolverUpdate,
	adminAbuseReportNotificationRecipientCreate, adminAbuseReportNotificationRecipientDelete,
	adminAbuseReportNotificationRecipientList, adminAbuseReportNotificationRecipientShow,
	adminAbuseReportNotificationRecipientUpdate,
	adminAccountsDelete, adminAccountsFindByEmail,
	adminAccountsPendingList, adminAccountsPendingRevoke,
	adminAdCreate, adminAdDelete, adminAdList, adminAdUpdate,
	adminAvatarDecorationsCreate, adminAvatarDecorationsDelete,
	adminAvatarDecorationsList, adminAvatarDecorationsUpdate,
	adminCaptchaCurrent, adminCaptchaSave,
	adminDriveCleanRemoteFiles, adminDriveCleanup, adminDriveDeleteAllFilesOfUser,
	adminDriveFiles, adminDriveShowFile,
	adminEmojiAdd, adminEmojiAddAliasesBulk, adminEmojiCopy, adminEmojiDelete,
	adminEmojiDeleteBulk, adminEmojiImportZip, adminEmojiList, adminEmojiListRemote,
	adminEmojiRemoveAliasesBulk, adminEmojiSetAliasesBulk, adminEmojiSetCategoryBulk,
	adminEmojiSetLicenseBulk, adminEmojiUpdate, v2AdminEmojiList,
	adminFederationDeleteAllFiles, adminFederationRefreshRemoteInstanceMetadata,
	adminFederationRemoveAllFollowing, adminFederationUpdateInstance,
	adminGetUserIps,
	adminIndieAuthCreate, adminIndieAuthDelete, adminIndieAuthList, adminIndieAuthUpdate,
	adminPromoCreate, adminQueueClear, adminQueueDeliverDelayed, adminQueueInboxDelayed,
	adminQueuePromote, adminQueueStats,
	adminRelaysAdd, adminRelaysList, adminRelaysRemove, adminSendEmail,
	adminSsoCreate, adminSsoDelete, adminSsoList, adminSsoUpdate,
	adminSystemWebhookCreate, adminSystemWebhookDelete, adminSystemWebhookList,
	adminSystemWebhookShow, adminSystemWebhookTest, adminSystemWebhookUpdate,
	adminUnsetUserMutualLink, adminUpdateProxyAccount,
} from './handlers/admin-ext.js';
import { adminMeta as adminMetaFromMeta } from './handlers/admin-meta.js';
import {
	appCreate, appShow,
	authAccept, authSessionGenerate, authSessionShow, authSessionUserkey,
	i2faDone, i2faKeyDone, i2faPasswordLess, i2faRegister, i2faRegisterKey,
	i2faRemoveKey, i2faUnregister, i2faUpdateKey,
	iApps, iAuthorizedApps,
	iWebhooksCreate, iWebhooksDelete, iWebhooksList, iWebhooksShow,
	iWebhooksTest, iWebhooksUpdate,
	miauthGenToken, myApps, iUpdateEmail,
} from './handlers/auth-ext.js';

const routes: Record<string, Handler> = {
	// Instance
	'meta': meta,
	'ping': ping,
	'stats': stats,
	'emojis': emojis,
	'server-info': serverInfo,
	'announcements': listAnnouncements,

	// Auth
	'admin/accounts/create': adminAccountsCreate,
	'signin': signin,
	'signin-flow': signinFlow,
	'signout': signout,
	'signup': signup,
	'i/change-password': changePassword,

	// Users
	'i': currentUser,
	'i/update': updateUser,
	'users/show': showUser,
	'users/search': searchUsers,

	// Notes
	'notes/create': createNote,
	'notes/show': showNote,
	'notes/show-partial-bulk': showPartialBulk,
	'notes/delete': deleteNote,
	'notes/timeline': timeline,
	'notes/local-timeline': timeline,
	'notes/hybrid-timeline': timeline,
	'notes/global-timeline': timeline,
	'users/notes': userNotes,
	'notes/search': searchNotes,
	'notes/state': noteState,
	'notes/mentions': noteMentions,
	'notes/conversation': noteConversation,

	// Reactions
	'notes/reactions/create': createReaction,
	'notes/reactions/delete': deleteReaction,
	'notes/reactions': listReactions,

	// Favorites
	'notes/favorites/create': createFavorite,
	'notes/favorites/delete': deleteFavorite,
	'i/favorites': listFavorites,

	// Notifications
	'i/notifications': listNotifications,
	'notifications/mark-all-as-read': markNotificationsRead,

	// Admin / Moderation
	'admin/suspend-user': suspendUser,
	'admin/unsuspend-user': unsuspendUser,
	'admin/moderators/add': addModerator,
	'admin/moderators/remove': removeModerator,
	'admin/show-users': showUsers,
	'admin/delete-account': deleteAccount,
	'admin/reset-password': resetPassword,
	'admin/update-meta': updateMeta,
	'admin/show-moderation-logs': showModerationLogs,
	'admin/announcements/create': createAnnouncement,
	'admin/announcements/delete': deleteAnnouncement,
	'admin/announcements/list': adminAnnouncementsList,
	'admin/announcements/update': adminAnnouncementsUpdate,
	'admin/meta': adminMetaFromMeta,
	'admin/show-user': adminShowUser,
	'admin/get-index-stats': adminGetIndexStats,
	'admin/get-table-stats': adminGetTableStats,
	'admin/invite/create': adminInviteCreate,
	'admin/invite/list': adminInviteList,
	'admin/regenerate-user-token': adminRegenerateUserToken,
	'admin/abuse-user-reports': adminAbuseUserReports,
	'admin/resolve-abuse-user-report': adminResolveAbuseUserReport,
	'admin/forward-abuse-user-report': adminForwardAbuseUserReport,
	'admin/update-abuse-user-report': adminUpdateAbuseUserReport,
	'admin/show-user-account-move-logs': adminShowUserAccountMoveLogs,
	'admin/unset-user-avatar': adminUnsetUserAvatar,
	'admin/unset-user-banner': adminUnsetUserBanner,
	'admin/update-user-name': adminUpdateUserName,
	'admin/update-user-note': adminUpdateUserNote,

	// Invites
	'invite/create': createInvite,
	'invite/list': listInvites,

	'endpoints': async () => json(Object.keys(routes)),

	// Registry (user preferences / frontend settings store)
	'i/registry/get-all': registryGetAll,
	'i/registry/get': registryGet,
	'i/registry/set': registrySet,
	'i/registry/remove': registryRemove,
	'i/registry/keys': registryKeys,

	// Service Worker
	'sw/register': swRegister,
	'sw/unregister': swUnregister,
	'sw/show-registration': swShowRegistration,
	'sw/update-registration': swUpdateRegistration,

	// Various endpoints from misc.ts
	'i/read-announcement': readAnnouncement,
	'bubble-game/ranking': bubbleGameRanking,
	'bubble-game/register': bubbleGameRegister,
	'i/claim-achievement': iClaimAchievement,

	// Misc endpoints implemented in misc.ts
	'username/available': usernameAvailable,
	'email-address/available': emailAddressAvailable,
	'get-online-users-count': getOnlineUsersCount,
	'emoji': emojiSingle,
	'endpoint': endpointSingle,
	'announcements/show': announcementShow,
	'announcement': announcementShow,
	'i/pin': iPin,
	'i/unpin': iUnpin,
	'i/delete-account': iDeleteAccount,
	'i/regenerate-token': iRegenerateToken,
	'i/registry/get-detail': iRegistryGetDetail,
	'i/registry/keys-with-type': iRegistryKeysWithType,
	'i/registry/scopes-with-domain': iRegistryScopesWithDomain,
	'i/revoke-token': iRevokeToken,
	'test': testEndpoint,
	'notifications/create': notificationsCreate,
	'notifications/flush': notificationsFlush,
	'invite/delete': inviteDelete,
	'invite/limit': inviteLimit,
	// Diagnostic endpoints — CI control group (see endpoint_info.json __diagnostic)
	'test/list-stub': testListStub,
	'test/post-stub': testPostStub,
	'test/list-malfunction': testListMalfunction,
	'test/post-malfunction': testPostMalfunction,

	// Following
	'following/create': followCreate,
	'following/delete': followDelete,
	'following/invalidate': followInvalidate,
	'following/requests/accept': followRequestsAccept,
	'following/requests/cancel': followRequestsCancel,
	'following/requests/list': followRequestsList,
	'following/requests/reject': followRequestsReject,
	'following/requests/sent': followRequestsSent,
	'following/update': followUpdate,
	'following/update-all': followUpdateAll,
	'users/followers': usersFollowers,
	'users/following': usersFollowing,

	// Blocking
	'blocking/create': blockingCreate,
	'blocking/delete': blockingDelete,
	'blocking/list': blockingList,

	// Muting
	'mute/create': muteCreate,
	'mute/delete': muteDelete,
	'mute/list': muteList,
	'renote-mute/create': renoteMuteCreate,
	'renote-mute/delete': renoteMuteDelete,
	'renote-mute/list': renoteMuteList,

	// Clips
	'clips/create': clipsCreate,
	'clips/delete': clipsDelete,
	'clips/show': clipsShow,
	'clips/update': clipsUpdate,
	'clips/list': clipsList,
	'clips/add-note': clipsAddNote,
	'clips/remove-note': clipsRemoveNote,
	'clips/notes': clipsNotes,
	'clips/favorite': clipsFavorite,
	'clips/unfavorite': clipsUnfavorite,
	'clips/my-favorites': clipsMyFavorites,
	'i/clips': iClipsFromClips,
	'users/clips': usersClips,
	'notes/clips': notesClips,

	// Channels
	'channels/create': channelsCreate,
	'channels/show': channelsShow,
	'channels/update': channelsUpdate,
	'channels/follow': channelsFollow,
	'channels/unfollow': channelsUnfollow,
	'channels/followed': channelsFollowedFromChannels,
	'channels/featured': channelsFeaturedFromChannels,
	'channels/favorite': channelsFavorite,
	'channels/unfavorite': channelsUnfavorite,
	'channels/my-favorites': channelsMyFavorites,
	'channels/owned': channelsOwned,
	'channels/search': channelsSearch,
	'channels/timeline': channelsTimeline,
	'channels/featured-games': channelsFeaturedGames,

	// Antennas
	'antennas/create': antennasCreate,
	'antennas/delete': antennasDelete,
	'antennas/show': antennasShow,
	'antennas/update': antennasUpdate,
	'antennas/list': antennasListFromAntennas,
	'antennas/notes': antennasNotes,

	// Pages
	'pages/create': pagesCreate,
	'pages/delete': pagesDelete,
	'pages/show': pagesShow,
	'pages/update': pagesUpdate,
	'pages/like': pagesLike,
	'pages/unlike': pagesUnlike,
	'i/pages': iPages,
	'i/page-likes': iPageLikes,
	'users/pages': usersPages,

	// Flash
	'flash/create': flashCreate,
	'flash/delete': flashDelete,
	'flash/show': flashShow,
	'flash/update': flashUpdate,
	'flash/like': flashLike,
	'flash/unlike': flashUnlike,
	'flash/my': flashMy,
	'flash/my-likes': flashMyLikes,
	'flash/featured': flashFeaturedFromFlash,
	'users/flashs': usersFlashs,

	// Gallery
	'gallery/posts': galleryPosts,
	'gallery/posts/create': galleryPostsCreate,
	'gallery/posts/delete': galleryPostsDelete,
	'gallery/posts/show': galleryPostsShow,
	'gallery/posts/update': galleryPostsUpdate,
	'gallery/posts/like': galleryPostsLike,
	'gallery/posts/unlike': galleryPostsUnlike,
	'gallery/popular': galleryPopular,
	'gallery/featured': galleryFeaturedFromGallery,
	'i/gallery/posts': iGalleryPosts,
	'i/gallery/likes': iGalleryLikesFromGallery,
	'users/gallery/posts': usersGalleryPosts,

	// User Lists
	'users/lists/create': userListsCreate,
	'users/lists/delete': userListsDelete,
	'users/lists/show': userListsShow,
	'users/lists/update': userListsUpdate,
	'users/lists/list': userListsListFromUL,
	'users/lists/push': userListsPush,
	'users/lists/pull': userListsPull,
	'users/lists/get-memberships': userListsGetMemberships,
	'users/lists/create-from-public': userListsCreateFromPublic,
	'users/lists/favorite': userListsFavorite,
	'users/lists/unfavorite': userListsUnfavorite,
	'users/lists/update-membership': userListsUpdateMembership,
	'i/user-list-memberships': iUserListMembershipsFromUL,
	'notes/user-list-timeline': notesUserListTimeline,

	// Notes (additional)
	'notes/children': notesChildren,
	'notes/replies': notesReplies,
	'notes/renotes': notesRenotes,
	'notes/unrenote': deleteRenote,
	'notes/search-by-tag': searchByTag,
	'notes/thread-muting/create': threadMuteCreate,
	'notes/thread-muting/delete': threadMuteDelete,

	// Roles
	'admin/roles/create': adminRolesCreate,
	'admin/roles/delete': adminRolesDelete,
	'admin/roles/list': adminRolesList,
	'admin/roles/show': adminRolesShow,
	'admin/roles/update': adminRolesUpdate,
	'admin/roles/assign': adminRolesAssign,
	'admin/roles/unassign': adminRolesUnassign,
	'admin/roles/users': adminRolesUsers,
	'admin/roles/update-default-policies': adminRolesUpdateDefaultPolicies,
	'admin/roles/update-inline-policies': adminRolesUpdateInlinePolicies,
	'roles/list': rolesList,
	'roles/show': rolesShow,
	'roles/notes': rolesNotes,
	'roles/users': rolesUsers,

	// Users (additional)
	'users/relation': userRelation,
	'users/stats': userStats,
	'users/search-by-username-and-host': usersSearchByUsernameAndHost,
	'users/achievements': userAchievements,
	'users/featured-notes': userFeaturedNotes,
	'users/recommendation': usersRecommendation,
	'users/report-abuse': usersReportAbuse,
	'users/update-memo': usersUpdateMemo,
	'users/get-security-info': usersGetSecurityInfo,
	'users': listUsers,
	'users/reactions': usersReactions,
	'users/get-frequently-replied-users': usersGetFrequentlyRepliedUsers,
	'users/get-following-birthday-users': usersGetFollowingBirthdayUsers,
	'users/get-skeb-status': usersGetSkebStatus,

	// Hashtags
	'hashtags/trend': hashtagsTrend,
	'hashtags/list': hashtagsList,
	'hashtags/search': hashtagsSearch,
	'hashtags/show': hashtagsShow,
	'hashtags/users': hashtagsUsers,

	// Drive
	'drive': driveRoot,
	'drive/files': driveFiles,
	'drive/files/attached-notes': driveFilesAttachedNotes,
	'drive/files/check-existence': driveFilesCheckExistence,
	'drive/files/create': driveFilesCreate,
	'drive/files/delete': driveFilesDelete,
	'drive/files/find': driveFilesFind,
	'drive/files/find-by-hash': driveFilesFindByHash,
	'drive/files/show': driveFilesShow,
	'drive/files/update': driveFilesUpdate,
	'drive/files/upload-from-url': driveFilesUploadFromUrl,
	'drive/folders': driveFolders,
	'drive/folders/create': driveFoldersCreate,
	'drive/folders/delete': driveFoldersDelete,
	'drive/folders/find': driveFoldersFind,
	'drive/folders/show': driveFoldersShow,
	'drive/folders/update': driveFoldersUpdate,
	'drive/stream': driveStream,

	// Charts
	'charts/active-users': chartsActiveUsers,
	'charts/ap-request': chartsApRequest,
	'charts/drive': chartsDrive,
	'charts/federation': chartsFederation,
	'charts/instance': chartsInstance,
	'charts/notes': chartsNotes,
	'charts/user/drive': chartsUserDrive,
	'charts/user/following': chartsUserFollowing,
	'charts/user/notes': chartsUserNotes,
	'charts/user/pv': chartsUserPv,
	'charts/user/reactions': chartsUserReactions,
	'charts/users': chartsUsers,

	// Federation
	'federation/followers': federationFollowers,
	'federation/following': federationFollowing,
	'federation/instances': federationInstances,
	'federation/show-instance': federationShowInstance,
	'federation/stats': federationStats,
	'federation/update-remote-user': federationUpdateRemoteUser,
	'federation/users': federationUsers,

	// Reversi
	'reversi/cancel-match': reversiCancelMatch,
	'reversi/games': reversiGames,
	'reversi/invitations': reversiInvitations,
	'reversi/match': reversiMatch,
	'reversi/show-game': reversiShowGame,
	'reversi/surrender': reversiSurrender,
	'reversi/verify': reversiVerify,

	// Admin Extended
	'admin/abuse-report-resolver/create': adminAbuseReportResolverCreate,
	'admin/abuse-report-resolver/delete': adminAbuseReportResolverDelete,
	'admin/abuse-report-resolver/list': adminAbuseReportResolverList,
	'admin/abuse-report-resolver/update': adminAbuseReportResolverUpdate,
	'admin/abuse-report/notification-recipient/create': adminAbuseReportNotificationRecipientCreate,
	'admin/abuse-report/notification-recipient/delete': adminAbuseReportNotificationRecipientDelete,
	'admin/abuse-report/notification-recipient/list': adminAbuseReportNotificationRecipientList,
	'admin/abuse-report/notification-recipient/show': adminAbuseReportNotificationRecipientShow,
	'admin/abuse-report/notification-recipient/update': adminAbuseReportNotificationRecipientUpdate,
	'admin/accounts/delete': adminAccountsDelete,
	'admin/accounts/find-by-email': adminAccountsFindByEmail,
	'admin/accounts/pending/list': adminAccountsPendingList,
	'admin/accounts/pending/revoke': adminAccountsPendingRevoke,
	'admin/ad/create': adminAdCreate,
	'admin/ad/delete': adminAdDelete,
	'admin/ad/list': adminAdList,
	'admin/ad/update': adminAdUpdate,
	'admin/avatar-decorations/create': adminAvatarDecorationsCreate,
	'admin/avatar-decorations/delete': adminAvatarDecorationsDelete,
	'admin/avatar-decorations/list': adminAvatarDecorationsList,
	'admin/avatar-decorations/update': adminAvatarDecorationsUpdate,
	'admin/captcha/current': adminCaptchaCurrent,
	'admin/captcha/save': adminCaptchaSave,
	'admin/drive/clean-remote-files': adminDriveCleanRemoteFiles,
	'admin/drive/cleanup': adminDriveCleanup,
	'admin/drive/delete-all-files-of-a-user': adminDriveDeleteAllFilesOfUser,
	'admin/drive/files': adminDriveFiles,
	'admin/drive/show-file': adminDriveShowFile,
	'admin/emoji/add': adminEmojiAdd,
	'admin/emoji/add-aliases-bulk': adminEmojiAddAliasesBulk,
	'admin/emoji/copy': adminEmojiCopy,
	'admin/emoji/delete': adminEmojiDelete,
	'admin/emoji/delete-bulk': adminEmojiDeleteBulk,
	'admin/emoji/import-zip': adminEmojiImportZip,
	'admin/emoji/list': adminEmojiList,
	'admin/emoji/list-remote': adminEmojiListRemote,
	'admin/emoji/remove-aliases-bulk': adminEmojiRemoveAliasesBulk,
	'admin/emoji/set-aliases-bulk': adminEmojiSetAliasesBulk,
	'admin/emoji/set-category-bulk': adminEmojiSetCategoryBulk,
	'admin/emoji/set-license-bulk': adminEmojiSetLicenseBulk,
	'admin/emoji/update': adminEmojiUpdate,
	'admin/federation/delete-all-files': adminFederationDeleteAllFiles,
	'admin/federation/refresh-remote-instance-metadata': adminFederationRefreshRemoteInstanceMetadata,
	'admin/federation/remove-all-following': adminFederationRemoveAllFollowing,
	'admin/federation/update-instance': adminFederationUpdateInstance,
	'admin/get-user-ips': adminGetUserIps,
	'admin/indie-auth/create': adminIndieAuthCreate,
	'admin/indie-auth/delete': adminIndieAuthDelete,
	'admin/indie-auth/list': adminIndieAuthList,
	'admin/indie-auth/update': adminIndieAuthUpdate,
	'admin/promo/create': adminPromoCreate,
	'admin/queue/clear': adminQueueClear,
	'admin/queue/deliver-delayed': adminQueueDeliverDelayed,
	'admin/queue/inbox-delayed': adminQueueInboxDelayed,
	'admin/queue/promote': adminQueuePromote,
	'admin/queue/stats': adminQueueStats,
	'admin/relays/add': adminRelaysAdd,
	'admin/relays/list': adminRelaysList,
	'admin/relays/remove': adminRelaysRemove,
	'admin/send-email': adminSendEmail,
	'admin/sso/create': adminSsoCreate,
	'admin/sso/delete': adminSsoDelete,
	'admin/sso/list': adminSsoList,
	'admin/sso/update': adminSsoUpdate,
	'admin/system-webhook/create': adminSystemWebhookCreate,
	'admin/system-webhook/delete': adminSystemWebhookDelete,
	'admin/system-webhook/list': adminSystemWebhookList,
	'admin/system-webhook/show': adminSystemWebhookShow,
	'admin/system-webhook/test': adminSystemWebhookTest,
	'admin/system-webhook/update': adminSystemWebhookUpdate,
	'admin/unset-user-mutual-link': adminUnsetUserMutualLink,
	'admin/update-proxy-account': adminUpdateProxyAccount,
	'v2/admin/emoji/list': v2AdminEmojiList,

	// App / Auth Extended
	'app/create': appCreate,
	'app/show': appShow,
	'auth/accept': authAccept,
	'auth/session/generate': authSessionGenerate,
	'auth/session/show': authSessionShow,
	'auth/session/userkey': authSessionUserkey,
	'i/2fa/done': i2faDone,
	'i/2fa/key-done': i2faKeyDone,
	'i/2fa/password-less': i2faPasswordLess,
	'i/2fa/register': i2faRegister,
	'i/2fa/register-key': i2faRegisterKey,
	'i/2fa/remove-key': i2faRemoveKey,
	'i/2fa/unregister': i2faUnregister,
	'i/2fa/update-key': i2faUpdateKey,
	'i/apps': iApps,
	'i/authorized-apps': iAuthorizedApps,
	'i/update-email': iUpdateEmail,
	'i/webhooks/create': iWebhooksCreate,
	'i/webhooks/delete': iWebhooksDelete,
	'i/webhooks/list': iWebhooksList,
	'i/webhooks/show': iWebhooksShow,
	'i/webhooks/test': iWebhooksTest,
	'i/webhooks/update': iWebhooksUpdate,
	'miauth/gen-token': miauthGenToken,
	'my/apps': myApps,

	// Misc / misc.ts
	'i/notifications-grouped': iNotificationsGrouped,
	'i/signin-history': iSigninHistory,
	'i/purge-timeline-cache': iPurgeTimelineCache,
	'i/move': iMove,
	'notes/featured': notesFeatured,
	'notes/polls/vote': notesPollsVote,
	'notes/polls/recommendation': notesPollsRecommendation,
	'fetch-rss': fetchRss,
	'fetch-external-resources': fetchExternalResources,
	'get-avatar-decorations': getAvatarDecorations,
	'pinned-users': pinnedUsers,
	'retention': retention,
	'pages/featured': pagesFeatured,
	'promo/read': promoRead,
	'page-push': pagePush,
	'request-reset-password': requestResetPassword,
	'reset-password': resetPasswordHandler,
	'reset-db': resetDb,

	// ActivityPub (no remote federation; resolves local objects only)
	'ap/get': apGet,
	'ap/show': apShow,

	// Notifications
	'notifications/test-notification': notificationsTestNotification,

	// Export / Import (fire-and-forget; 204 accepted)
	'export-custom-emojis': exportCustomEmojis,
	'i/export-antennas': iExportAntennas,
	'i/export-blocking': iExportBlocking,
	'i/export-clips': iExportClips,
	'i/export-favorites': iExportFavorites,
	'i/export-following': iExportFollowing,
	'i/export-mute': iExportMute,
	'i/export-notes': iExportNotes,
	'i/export-user-lists': iExportUserLists,
	'i/import-antennas': iImportAntennas,
	'i/import-blocking': iImportBlocking,
	'i/import-following': iImportFollowing,
	'i/import-muting': iImportMuting,
	'i/import-user-lists': iImportUserLists,

	// Notes – public list + scheduled + translate
	'notes': notesList,
	'notes/scheduled/list': notesScheduledList,
	'notes/scheduled/cancel': notesScheduledCancel,
	'notes/translate': notesTranslate,
};

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		if (request.method === 'OPTIONS') {
			return new Response(null, { status: 204, headers: cors() });
		}

		const url = new URL(request.url);

		// .well-known/nodeinfo — federation discovery stub
		if (url.pathname === '/.well-known/nodeinfo') {
			return json({
				links: [{ rel: 'http://nodeinfo.diaspora.software/ns/schema/2.1', href: `${url.origin}/nodeinfo/2.1` }],
			});
		}
		if (url.pathname === '/nodeinfo/2.1') {
			const initialized = await env.DB.prepare("SELECT value FROM meta WHERE key = 'initialized'").first<{ value: string }>().catch(() => null);
			const users = await env.DB.prepare('SELECT COUNT(*) as c FROM users').first<{ c: number }>().catch(() => ({ c: 0 }));
			const notes = await env.DB.prepare('SELECT COUNT(*) as c FROM notes').first<{ c: number }>().catch(() => ({ c: 0 }));
			return json({
				version: '2.1',
				software: { name: 'misslite', version: '2026.3.0' },
				protocols: ['misskey'],
				usage: { users: { total: users?.c ?? 0 }, localPosts: notes?.c ?? 0 },
				openRegistrations: !initialized,
			});
		}

		// R2 file serving — GET /files/*
		if (url.pathname.startsWith('/files/') && request.method === 'GET') {
			const r2Key = url.pathname.slice('/files/'.length);
			if (!r2Key) return err('Not found', 404);
			if (!env.R2) return err('File storage not configured', 503);
			await ensureSchema(env.DB);
			const obj = await env.R2.get(r2Key);
			if (!obj) return err('Not found', 404);
			const headers = new Headers({ 'Access-Control-Allow-Origin': '*' });
			const contentType = obj.httpMetadata?.contentType ?? 'application/octet-stream';
			headers.set('Content-Type', contentType);
			headers.set('Cache-Control', 'public, max-age=31536000, immutable');
			return new Response(obj.body, { headers });
		}

		const path = url.pathname.replace(/^\/api\//, '').replace(/\/$/, '');

		if (!path || path === '') {
			return json({ name: 'Misslite CF', version: '0.1.0' });
		}

		const handler = routes[path];
		if (!handler) {
			return err('Unknown endpoint: ' + path, 404);
		}

		let body: Record<string, unknown> = {};
		if (request.method === 'POST') {
			const ct = request.headers.get('content-type') ?? '';
			if (!ct.includes('multipart/form-data') && !ct.includes('application/x-www-form-urlencoded')) {
				try {
					body = await request.json() as Record<string, unknown>;
				} catch {
					body = {};
				}
			}
		}

		try {
			await ensureSchema(env.DB);
			return await handler(env.DB, body, env, request);
		} catch (e) {
			console.error('Handler error:', e);
			return err('Internal server error', 500);
		}
	},
};

export type { Env };
