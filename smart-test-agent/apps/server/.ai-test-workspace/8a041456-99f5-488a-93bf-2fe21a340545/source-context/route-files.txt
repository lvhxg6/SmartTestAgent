import React from "react";

//let customForm = React.lazy(() => import('../pages/formMange/customForm'));

//通过menu.js里菜单的key把每一个菜单对应的路径配置出来;
let elementList = {

    // 任务自动下发配置
    'AUTO_SCAN_CONFIG' : React.lazy(()=>import("../pages/autoScan")),

    'GROUP_CHECK_TASK' : React.lazy(()=>import("../pages/GroupInspection")),
    'operationRecord': React.lazy(()=>import("../pages/GroupInspection/pages/OperationRecord")),
    'taskDetails': React.lazy(()=>import("../pages/GroupInspection/pages/TaskDetail")),
    'selfExaminationTasks' :React.lazy(()=>import("../pages/GroupInspection/pages/SelfExaminationTasks")),

    'GROUP_REPORT_RECORD' : React.lazy(()=>import("../pages/ReportRecord")),

    // 'WORKBENCH' : React.lazy(()=>import("../pages/ToolManage")),

    'GROUP_PUSH_DATA' : React.lazy(()=>import("../pages/PushData")),
    'checkItemHistory':  React.lazy(()=>import("../pages/PushData/pages/history")),

    'PROVINCE_CALL_GROUP' : React.lazy(()=>import("../pages/CallForProvincial")),
    'createTask_online' : React.lazy(()=>import("../pages/CallForProvincial/pages/CreateTaskOnline")),
    'createTask_offline' : React.lazy(()=>import("../pages/CallForProvincial/pages/CreateTaskOffline")),
    'baseline_details' : React.lazy(()=>import("../pages/CallForProvincial/pages/BaselineDetails")),
    'weakPassword_details' : React.lazy(()=>import("../pages/CallForProvincial/pages/WeakPasswordDetails")),
    'firewall_details' : React.lazy(()=>import("../pages/CallForProvincial/pages/FirewallDetails")),
    'TEST_REQUEST' : React.lazy(()=>import("../pages/TestRequest")),
    'TEST_REQUEST1' : React.lazy(()=>import("../pages/TestRequest")),
    //补丁管理
    'PATCH_MANAGER' : React.lazy(()=>import("../pages/PatchManager")),
    'SAFE_CHANGE_CHECK' : React.lazy(()=>import("../pages/taskCenter/safeChangeCheck")),
    'safe_change_check_add' : React.lazy(()=>import("../pages/taskCenter/safeChangeCheck/add")),
    'safe_change_check_follow' : React.lazy(()=>import("../pages/taskCenter/safeChangeCheck/follow")),
    //补丁识别检测
    'PATCH_RECOGNITION_CHECK' : React.lazy(()=>import("../pages/taskCenter/Recognition")),
    'patch_recognition_add' : React.lazy(()=>import("../pages/taskCenter/Recognition/add")),
    'patch_recognition_details' : React.lazy(()=>import("../pages/taskCenter/Recognition/follow")),

    //补丁统计分析
    'PATCH_CENSUS_ANALYSE' : React.lazy(()=>import("../pages/Vulnerability/PatchCensusAnalyse")),

    //工具能力评估
    'TOOL_ASSESSMENT' : React.lazy(()=>import("../pages/OperationCenter")),
    //威胁情报分析
    'THREAT_INTELLIGENCE' : React.lazy(()=>import("../pages/taskCenter/threatLntelligence")),
    //误报处理
    'FALSE_POSITIVE_ANALYSIS': React.lazy(()=>import("../pages/taskCenter/FalseAlarmAnalysis")),
    //误报处理-手动填报
    'manual-report' : React.lazy(()=>import("../pages/taskCenter/FalseAlarmAnalysis/ManualReport")),

    'VUL_REPAIR_PRIORITY_ANALYSIS' : React.lazy(()=>import("../pages/taskCenter/VulnerabilityRepair")),

    //漏洞一张图
    // 'VUL_MAP' : React.lazy(()=>import("../pages/securityoperationscenter/vulmap")),
    'VUL_MAP' : React.lazy(()=>import("../pages/securityoperationscenter/vulstatisinfo")),
    //漏洞一张图-v2版本
    'VUL_MAP_V2' : React.lazy(()=>import("../pages/securityoperationscenter/vulstatisinfo")),
    //两高一弱
    'TWO_HIGH_ONE_WEAK' : React.lazy(()=>import("../pages/securityoperationscenter/twohighoneweak")),
    'TWO_HIGH_ONE_WEAK_DETAIL' : React.lazy(()=>import("../pages/securityoperationscenter/twohighoneweak/detail")),
    //漏洞威胁情报运营
    'VUL_THREAT_INTELLIGENCE' : React.lazy(()=>import("../pages/securityoperationscenter/vulthreatintelligence")),
    //'PROBMEL_DISPOSAL_CUSTOM_FORM': customForm,

    //海南项目- 合规平台纳管自动化渗透测试工具
    'PENETRATION_CHECK' : React.lazy(()=>import("../pages/taskCenter/penetrationCheck")),
    'PENETRATION_CHECK_ADD' : React.lazy(()=>import("../pages/taskCenter/penetrationCheck/add")),
    'PENETRATION_CHECK_DETAILS' : React.lazy(()=>import("../pages/taskCenter/penetrationCheck/follow")),

    //SDC-安全告警处置结果
    'SDC_SECURITY_ALERT': React.lazy(() => import("../pages/sdcsecurityalert/list")),
    // 站点指纹管理
    'SITE_FINGERPRINT': React.lazy(() => import("../pages/taskCenter/siteFingerprint/list")),
    // 站点检测
    'SITE_CHECK': React.lazy(() => import("../pages/taskCenter/webSiteDetection/index")),
    'SITE_CHECK_ADD' : React.lazy(()=>import("../pages/taskCenter/webSiteDetection/add")),
    'SITE_CHECK_DETAILS' : React.lazy(()=>import("../pages/taskCenter/webSiteDetection/follow")),
    // 问题处置
    'DISPOSAL_PROBLEM': React.lazy(() => import("../pages/problemdisposal/problemdisposalmanager")),
    // 流程节点管理
    'PROCESS_NODE_MANAGER' : React.lazy(() => import("../pages/problemdisposal/nodemanager")),
    // 流程操作管理
    'OPERATION_MANAGE' : React.lazy(()=>import("../pages/problemdisposal/operationmanager/index")),
}

//定义一些固定的菜单;
let first = {
    'path': '/first',
    'element': elementList['first'],
    'rightCode':'',
    'name':'',
}

//定义menu.js模块中的新建、查看、编辑等子菜单;
let routerChild = [{
    'path': '/record',
    'element': elementList['operationRecord'],
    'rightCode': 'GROUP_CHECK_TASK',
    'name': '',
},{
    'path': '/details',
    'element': elementList['taskDetails'],
    'rightCode': 'GROUP_CHECK_TASK',
    'name': '',
},{
    'path': '/selfExaminationTasks',
    'element': elementList['selfExaminationTasks'],
    'rightCode': 'GROUP_CHECK_TASK',
    'name': '',
},{
    'path': '/history',
    'element': elementList['checkItemHistory'],
    'rightCode': 'GROUP_PUSH_DATA',
    'name': '',
},{
    'path': '/createTaskOnline',
    'element': elementList['createTask_online'],
    'rightCode': 'PROVINCE_CALL_GROUP',
    'name': '',
},{
    'path': '/createTaskOffline',
    'element': elementList['createTask_offline'],
    'rightCode': 'PROVINCE_CALL_GROUP',
    'name': '',
},{
    'path': '/baselineDetails',
    'element': elementList['baseline_details'],
    'rightCode': 'PROVINCE_CALL_GROUP',
    'name': '',
},{
    'path': '/weakPassword_details',
    'element': elementList['weakPassword_details'],
    'rightCode': 'PROVINCE_CALL_GROUP',
    'name': '',
},{
    'path': '/firewall_details',
    'element': elementList['firewall_details'],
    'rightCode': 'PROVINCE_CALL_GROUP',
    'name': '',
},{
    'path': '/add',
    'element': elementList['safe_change_check_add'],
    'rightCode': 'SAFE_CHANGE_CHECK',
    'name': '',

},{
    'path': '/follow',
    'element': elementList['safe_change_check_follow'],
    'rightCode': 'SAFE_CHANGE_CHECK',
    'name': '',
}
,{
    'path': '/follow',
    'element': elementList['safe_change_check_follow'],
    'rightCode': 'SAFE_CHANGE_CHECK',
    'name': '',
},{
    'path': '/add',
    'element': elementList['patch_recognition_add'],
    'rightCode': 'PATCH_RECOGNITION_CHECK',
    'name': '',
},{
    'path': '/details',
    'element': elementList['patch_recognition_details'],
    'rightCode': 'PATCH_RECOGNITION_CHECK',
    'name': '',
},
    {
        'path':'/manual-report',
         'element': elementList['manual-report'],
         'rightCode': 'FALSE_POSITIVE_ANALYSIS'
    },
    {
        'path':'/detail',
         'element': elementList['TWO_HIGH_ONE_WEAK_DETAIL'],
         'rightCode': 'TWO_HIGH_ONE_WEAK',
         'name': '两高一弱详情'
    }, {
        'path': '/add',
        'element': elementList['PENETRATION_CHECK_ADD'],
        'rightCode': 'PENETRATION_CHECK',
        'name': '',
    },{
        'path': '/details',
        'element': elementList['PENETRATION_CHECK_DETAILS'],
        'rightCode': 'PENETRATION_CHECK',
        'name': '',
    },
    {
        'path': '/add',
        'element': React.lazy(() => import("../pages/taskCenter/siteFingerprint/add")),
        'rightCode': 'SITE_FINGERPRINT',
        'name': '新增站点'
    },
    {
        'path': '/edit',
        'element': React.lazy(() => import("../pages/taskCenter/siteFingerprint/edit")),
        'rightCode': 'SITE_FINGERPRINT',
        'name': '编辑站点'
    },
    {
        'path': '/add',
        'element': elementList['SITE_CHECK_ADD'],
        'rightCode': 'SITE_CHECK',
        'name': '',
    },{
        'path': '/details',
        'element': elementList['SITE_CHECK_DETAILS'],
        'rightCode': 'SITE_CHECK',
        'name': '',
    },
];

//let routerCustom = [{
//    'key': '/safeChangeCheck',
//    'element': elementList['SAFE_CHANGE_CHECK'],
//    'rightCode': 'SAFE_CHANGE_CHECK',
//    'name': 'qqq',
//}]


export {
    elementList ,
    first ,
    routerChild,
    //routerCustom
}














