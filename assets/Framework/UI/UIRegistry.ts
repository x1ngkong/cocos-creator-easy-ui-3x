/*************************************************************************************
 * @File        : UIRegistry.ts
 * @Author      : xingkong6
 * @Date        : 2026-05-06
 * @License     : Copyright (c) 2026 xingkong6. Internal use only, no redistribution or resale.
 * @Description : UI 配置注册中心
 *************************************************************************************/

import { UIConfig } from "./UIDefines";

export class UIRegistry {
    /** 配置映射 */
    private static readonly mConfigMap = new Map<string, UIConfig>();

    /** 注册单个 UI 配置 */
    public static Register(config: UIConfig): void {
        if (!config.id) {
            console.error("[UIRegistry] Register failed: config.id is empty.");
            return;
        }
        if (this.mConfigMap.has(config.id)) {
            console.warn(`[UIRegistry] Register: "${config.id}" already registered, overwriting.`);
        }
        this.mConfigMap.set(config.id, config);
    }

    /** 批量注册 UI 配置 */
    public static BatchRegister(configList: UIConfig[]): void {
        configList.forEach(c => this.Register(c));
    }

    /** 根据 UIId 获取配置 */
    public static Get(uiId: string): UIConfig | undefined {
        return this.mConfigMap.get(uiId);
    }

    /** 判断配置是否存在 */
    public static Has(uiId: string): boolean {
        return this.mConfigMap.has(uiId);
    }
}
