<template>
  <emailScroll ref="scroll"
               :cancel-success="cancelStar"
               :star-success="addStar"
               :getEmailList="getEmailList"
               :emailDelete="emailDelete"
               :star-add="starAdd"
               :star-cancel="starCancel"
               :time-sort="params.timeSort"
               :email-read="emailRead"
               :show-unread="true"
               actionLeft="4px"
               @jump="jumpContent"
  >
    <template #first>
      <button type="button" class="icon-button" :aria-label="$t('sortTime')" :title="$t('sortTime')" @click="changeTimeSort">
        <Icon :icon="params.timeSort === 0 ? 'material-symbols-light:timer-arrow-down-outline' : 'material-symbols-light:timer-arrow-up-outline'" width="28"/>
      </button>
    </template>

  </emailScroll>
</template>

<script setup>
import {useAccountStore} from "@/store/account.js";
import {useEmailStore} from "@/store/email.js";
import {useSettingStore} from "@/store/setting.js";
import emailScroll from "@/components/email-scroll/index.vue"
import {emailList, emailDelete, emailLatest, emailRead} from "@/request/email.js";
import {starAdd, starCancel} from "@/request/star.js";
import {defineOptions, onMounted, onUnmounted, reactive, ref, watch} from "vue";
import {inboxWs, isAutoRefreshEnabled} from "@/websocket/client.js";
import router from "@/router/index.js";
import {Icon} from "@iconify/vue";
import { useRoute } from 'vue-router'

defineOptions({
  name: 'email'
})

const route = useRoute();
const emailStore = useEmailStore();
const accountStore = useAccountStore();
const settingStore = useSettingStore();
const scroll = ref({})
const params = reactive({
  timeSort: 0,
})

onMounted(() => {
  emailStore.emailScroll = scroll;
  inboxWs.start({
    isEnabled: () => route.name === 'email' && isAutoRefreshEnabled(settingStore.settings.autoRefresh),
    onMessage: event => {
      if (accountStore.currentAccount.allReceive || Number(event.accountId) === Number(accountStore.currentAccountId)) scheduleLatest()
    },
    onReconnect: scheduleLatest,
  })
})


watch(() => accountStore.currentAccountId, () => {
  scroll.value.refreshList();
})
watch(() => [route.name, settingStore.settings.autoRefresh], () => inboxWs.sync())
watch(() => emailStore.searchParams, () => scroll.value.refreshList(), { deep: true })

function changeTimeSort() {
  params.timeSort = params.timeSort ? 0 : 1
  scroll.value.refreshList();
}

function jumpContent(email) {
  emailStore.contentData.email = email
  emailStore.contentData.delType = 'logic'
  emailStore.contentData.showUnread = true
  emailStore.contentData.showStar = true
  emailStore.contentData.showReply = true
  router.push('/message')
}

let disposed = false
let pullTimer
let pulling = false
let pullAgain = false
onUnmounted(() => { disposed = true; window.clearTimeout(pullTimer); inboxWs.stop() })

function scheduleLatest() {
  window.clearTimeout(pullTimer)
  pullTimer = window.setTimeout(pullLatest, 150)
}

async function pullLatest() {
  if (pulling) { pullAgain = true; return }
  if (disposed || route.name !== 'email' || scroll.value.firstLoad) return
  const search = emailStore.searchParams
  if (search.text || search.startDate || search.endDate) {
    scroll.value.refreshList()
    return
  }
  const accountId = accountStore.currentAccountId
  const allReceive = accountStore.currentAccount.allReceive
  const timeSort = params.timeSort
  if (accountId !== scroll.value.latestEmail?.reqAccountId) return
  pulling = true
  try {
    let list
    do {
      const cursor = scroll.value.latestEmail
      list = await emailLatest(cursor?.emailId || 0, accountId, allReceive, cursor?.deliveryId)
      if (disposed || route.name !== 'email' || accountId !== accountStore.currentAccountId ||
          timeSort !== params.timeSort || allReceive !== accountStore.currentAccount.allReceive) return
      for (const email of list) {
        email.reqAccountId = accountId
        email.allReceive = allReceive
        scroll.value.addItem(email)
      }
    } while (list.length >= 20)
  } catch (error) {
    if (error.code === 401 || error.code === 403) {
      settingStore.settings.autoRefresh = 1
      inboxWs.sync()
    }
  } finally {
    pulling = false
    if (pullAgain) { pullAgain = false; scheduleLatest() }
  }
}

function addStar(email) {
  emailStore.starScroll?.addItem(email)
}

function cancelStar(email) {
  emailStore.starScroll?.deleteEmail([email.emailId])
}

function getEmailList(emailId, size, signal) {
  const accountId =  accountStore.currentAccountId;
  const allReceive = accountStore.currentAccount.allReceive;
  return emailList(accountId, allReceive, emailId, params.timeSort, size, 0, signal, 1, emailStore.searchParams).then(data => {
    if (data.latestEmail) {
      data.latestEmail.reqAccountId = accountId;
      data.latestEmail.allReceive = allReceive;
    }
    return data;
  })
}

</script>
<style>
.icon {
  cursor: pointer;
}
</style>
